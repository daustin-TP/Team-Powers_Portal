alter table public.labor_team_members
  add column if not exists management_level text
  check (management_level is null or management_level in (
    'MIT',
    'Shift Lead Level 1',
    'Shift Lead Level 2',
    'Shift Lead Level 3',
    'Assistant Manager',
    'General Manager'
  ));

create table if not exists public.team_leave_balances (
  id uuid primary key default gen_random_uuid(),
  benefit_year integer not null check (benefit_year between 2026 and 2100),
  member_id uuid references public.labor_team_members(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  pto_hours numeric(8,2) not null default 0 check (pto_hours >= 0 and pto_hours = trunc(pto_hours)),
  vacation_hours numeric(8,2) not null default 0 check (vacation_hours >= 0 and vacation_hours = trunc(vacation_hours)),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  check ((member_id is not null)::integer + (profile_id is not null)::integer = 1)
);

create unique index if not exists team_leave_balances_member_year_idx
  on public.team_leave_balances(member_id, benefit_year)
  where member_id is not null;
create unique index if not exists team_leave_balances_profile_year_idx
  on public.team_leave_balances(profile_id, benefit_year)
  where profile_id is not null;

alter table public.payroll_time_off
  add column if not exists member_id uuid references public.labor_team_members(id) on delete restrict,
  add column if not exists beneficiary_profile_id uuid references public.profiles(id) on delete restrict,
  add column if not exists day_portion text check (day_portion is null or day_portion in ('full','half','remaining')),
  add column if not exists unavailable_start time,
  add column if not exists unavailable_end time,
  add column if not exists approval_mode text not null default 'approval' check (approval_mode in ('approval','notification')),
  add column if not exists reviewed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table public.labor_time_off
  add column if not exists source_time_off_request_id uuid references public.payroll_time_off(id) on delete restrict;

create unique index if not exists labor_time_off_source_request_day_idx
  on public.labor_time_off(source_time_off_request_id, week_start, day_of_week)
  where source_time_off_request_id is not null;
create index if not exists payroll_time_off_member_year_idx
  on public.payroll_time_off(member_id, start_date, status);
create index if not exists payroll_time_off_beneficiary_year_idx
  on public.payroll_time_off(beneficiary_profile_id, start_date, status);

alter table public.team_leave_balances enable row level security;
revoke all on public.team_leave_balances from anon, authenticated;
grant all on public.team_leave_balances to service_role;

create or replace function public.leave_action(actor uuid, action text, payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  p public.profiles%rowtype;
  m public.labor_team_members%rowtype;
  req public.payroll_time_off%rowtype;
  target_profile public.profiles%rowtype;
  scoped uuid[];
  s uuid;
  target_member uuid;
  target_profile_id uuid;
  benefit_year integer;
  kind_value text;
  start_day date;
  end_day date;
  start_clock time;
  end_clock time;
  duration_mode text;
  day_count integer;
  requested_hours numeric(8,2);
  allocated_hours numeric(8,2);
  committed_hours numeric(8,2);
  pto_value numeric(8,2);
  vacation_value numeric(8,2);
  can_approve boolean := false;
  approve_now boolean := false;
  request_status text := 'pending';
  result_id uuid;
begin
  select * into p from public.profiles where id = actor and active;
  if p.id is null or p.role::text not in ('manager','supervisor','admin') then
    raise exception 'PTO / Vacation access denied';
  end if;

  select array_agg(distinct sid) into scoped
  from (
    select p.store_id sid
    union
    select store_id from public.profile_store_assignments where profile_id = p.id
  ) access_rows
  where sid is not null;

  if action = 'save_level' then
    target_member := nullif(payload->>'member_id','')::uuid;
    select * into m from public.labor_team_members where id = target_member for update;
    if m.id is null or not ('manager' = any(m.qualified_roles)) then
      raise exception 'Choose a manager-qualified roster employee';
    end if;
    if p.role::text <> 'admin' and not coalesce(m.store_id = any(scoped), false) then
      raise exception 'Store access denied';
    end if;
    if nullif(payload->>'management_level','') is not null
       and payload->>'management_level' not in ('MIT','Shift Lead Level 1','Shift Lead Level 2','Shift Lead Level 3','Assistant Manager','General Manager') then
      raise exception 'Choose a valid management level';
    end if;
    update public.labor_team_members
      set management_level = nullif(payload->>'management_level',''), updated_at = now()
      where id = m.id;
    return jsonb_build_object('ok', true, 'member_id', m.id);
  end if;

  if action = 'save_balance' then
    if p.role::text <> 'admin' then raise exception 'Only administrators can assign PTO and Vacation balances'; end if;
    benefit_year := (payload->>'benefit_year')::integer;
    target_member := nullif(payload->>'member_id','')::uuid;
    target_profile_id := nullif(payload->>'profile_id','')::uuid;
    pto_value := coalesce((payload->>'pto_hours')::numeric, 0);
    vacation_value := coalesce((payload->>'vacation_hours')::numeric, 0);
    if benefit_year not between 2026 and 2100
       or (target_member is null) = (target_profile_id is null)
       or pto_value < 0 or vacation_value < 0
       or pto_value <> trunc(pto_value) or vacation_value <> trunc(vacation_value) then
      raise exception 'Enter valid whole-hour annual balances';
    end if;
    if target_member is not null then
      select * into m from public.labor_team_members where id = target_member;
      if m.id is null or not ('manager' = any(m.qualified_roles)) then raise exception 'Choose a manager-qualified roster employee'; end if;
    else
      select * into target_profile from public.profiles where id = target_profile_id and active;
      if target_profile.id is null or target_profile.role::text not in ('supervisor','admin') then raise exception 'Choose an active above-store leader'; end if;
    end if;

    select coalesce(sum(hours),0) into committed_hours
    from public.payroll_time_off r
    where r.kind = 'PTO' and r.status in ('pending','approved')
      and extract(year from r.start_date)::integer = benefit_year
      and ((target_member is not null and r.member_id = target_member)
        or (target_profile_id is not null and r.beneficiary_profile_id = target_profile_id));
    if pto_value < committed_hours then raise exception 'PTO allocation cannot be below pending and approved requests'; end if;

    select coalesce(sum(hours),0) into committed_hours
    from public.payroll_time_off r
    where r.kind = 'Vacation' and r.status in ('pending','approved')
      and extract(year from r.start_date)::integer = benefit_year
      and ((target_member is not null and r.member_id = target_member)
        or (target_profile_id is not null and r.beneficiary_profile_id = target_profile_id));
    if vacation_value < committed_hours then raise exception 'Vacation allocation cannot be below pending and approved requests'; end if;

    if target_member is not null then
      insert into public.team_leave_balances(benefit_year,member_id,pto_hours,vacation_hours,updated_by)
      values(benefit_year,target_member,pto_value,vacation_value,p.id)
      on conflict (member_id,benefit_year) where member_id is not null
      do update set pto_hours=excluded.pto_hours,vacation_hours=excluded.vacation_hours,updated_by=p.id,updated_at=now();
    else
      insert into public.team_leave_balances(benefit_year,profile_id,pto_hours,vacation_hours,updated_by)
      values(benefit_year,target_profile_id,pto_value,vacation_value,p.id)
      on conflict (profile_id,benefit_year) where profile_id is not null
      do update set pto_hours=excluded.pto_hours,vacation_hours=excluded.vacation_hours,updated_by=p.id,updated_at=now();
    end if;
    return jsonb_build_object('ok', true);
  end if;

  if action = 'request' then
    target_member := nullif(payload->>'member_id','')::uuid;
    target_profile_id := nullif(payload->>'profile_id','')::uuid;
    kind_value := payload->>'kind';
    duration_mode := payload->>'day_portion';
    start_day := (payload->>'start_date')::date;
    end_day := (payload->>'end_date')::date;
    benefit_year := extract(year from start_day)::integer;
    if kind_value not in ('PTO','Vacation') or duration_mode not in ('full','half','remaining')
       or end_day < start_day or extract(year from end_day)::integer <> benefit_year
       or (target_member is null) = (target_profile_id is null) then
      raise exception 'Enter a valid PTO or Vacation request within one calendar year';
    end if;
    day_count := end_day - start_day + 1;

    if target_member is not null then
      select * into m from public.labor_team_members where id = target_member and active for update;
      if m.id is null or m.employment_status not in ('active','borrowed') or not ('manager'=any(m.qualified_roles)) then
        raise exception 'Choose an active manager-qualified roster employee';
      end if;
      s := m.store_id;
      if p.role::text <> 'admin' and not coalesce(s = any(scoped), false) then raise exception 'Store access denied'; end if;
      can_approve := p.role::text = 'admin'
        or (p.role::text = 'supervisor' and coalesce(s = any(scoped), false))
        or (p.role::text = 'manager' and coalesce(s = any(scoped), false)
            and coalesce(m.management_level,'') <> 'General Manager'
            and coalesce(m.profile_id <> p.id, true));
    else
      select * into target_profile from public.profiles where id = target_profile_id and active for update;
      if target_profile.id is null or target_profile.role::text not in ('supervisor','admin') then
        raise exception 'Choose an active above-store leader';
      end if;
      if p.role::text <> 'admin' and target_profile.id <> p.id then raise exception 'Above-store leaders may submit only their own request'; end if;
    end if;

    select coalesce(case when kind_value='PTO' then b.pto_hours else b.vacation_hours end,0)
      into allocated_hours
    from public.team_leave_balances b
    where b.benefit_year=benefit_year
      and ((target_member is not null and b.member_id=target_member)
        or (target_profile_id is not null and b.profile_id=target_profile_id));
    allocated_hours := coalesce(allocated_hours,0);

    select coalesce(sum(r.hours),0) into committed_hours
    from public.payroll_time_off r
    where r.kind=kind_value and r.status in ('pending','approved')
      and extract(year from r.start_date)::integer=benefit_year
      and ((target_member is not null and r.member_id=target_member)
        or (target_profile_id is not null and r.beneficiary_profile_id=target_profile_id));

    if duration_mode='full' then
      requested_hours := day_count * 8;
      start_clock := time '00:00';
      end_clock := time '23:59';
    elsif duration_mode='half' then
      requested_hours := day_count * 4;
      start_clock := (payload->>'unavailable_start')::time;
      end_clock := (payload->>'unavailable_end')::time;
      if start_clock is null or end_clock is null or end_clock <= start_clock
         or abs(extract(epoch from (end_clock-start_clock))/3600 - 4) > 0.001 then
        raise exception 'A half day must identify one four-hour unavailable window';
      end if;
    else
      requested_hours := allocated_hours - committed_hours;
      if day_count <> 1 or requested_hours <= 0 or requested_hours >= 4 then
        raise exception 'Remaining-hours requests are available only when fewer than four hours remain';
      end if;
      start_clock := (payload->>'unavailable_start')::time;
      end_clock := (payload->>'unavailable_end')::time;
      if start_clock is null or end_clock is null or end_clock <= start_clock
         or abs(extract(epoch from (end_clock-start_clock))/3600 - requested_hours) > 0.001 then
        raise exception 'The unavailable window must match the remaining balance';
      end if;
    end if;

    if requested_hours > allocated_hours - committed_hours then
      raise exception 'This request exceeds the available balance';
    end if;

    approve_now := coalesce((payload->>'approve_now')::boolean,false);
    if target_profile_id is not null then
      request_status := 'approved';
    elsif approve_now and can_approve then
      request_status := 'approved';
    else
      request_status := 'pending';
    end if;

    insert into public.payroll_time_off(
      requester_id,requester_name,requester_role,store_id,kind,start_date,end_date,hours,note,status,
      reviewed_by,member_id,beneficiary_profile_id,day_portion,unavailable_start,unavailable_end,
      approval_mode,reviewed_at,updated_at
    )
    values(
      p.id,
      case when target_member is not null then m.display_name else target_profile.full_name end,
      case when target_member is not null then coalesce(m.management_level,'Manager') else target_profile.role::text end,
      s,kind_value,start_day,end_day,requested_hours,left(coalesce(payload->>'note',''),2000),request_status,
      case when request_status='approved' then p.id end,target_member,target_profile_id,duration_mode,start_clock,end_clock,
      case when target_profile_id is not null then 'notification' else 'approval' end,
      case when request_status='approved' then now() end,now()
    ) returning id into result_id;

    if request_status='approved' and target_member is not null then
      insert into public.labor_time_off(store_id,member_id,week_start,day_of_week,start_time,end_time,reason,source_time_off_request_id)
      select s,target_member,
        work_day::date - (extract(isodow from work_day)::integer - 1),
        extract(isodow from work_day)::integer - 1,
        start_clock,end_clock,
        kind_value || ' approved · ' || requested_hours || ' hours',
        result_id
      from generate_series(start_day,end_day,interval '1 day') work_day
      on conflict (source_time_off_request_id,week_start,day_of_week)
        where source_time_off_request_id is not null do nothing;
    end if;
    return jsonb_build_object('ok',true,'id',result_id,'status',request_status,'hours',requested_hours);
  end if;

  if action in ('review','cancel') then
    select * into req from public.payroll_time_off where id=(payload->>'id')::uuid for update;
    if req.id is null then raise exception 'Request not found'; end if;
    if req.member_id is not null then
      select * into m from public.labor_team_members where id=req.member_id;
      s := m.store_id;
      can_approve := p.role::text='admin'
        or (p.role::text='supervisor' and coalesce(s=any(scoped),false))
        or (p.role::text='manager' and coalesce(s=any(scoped),false)
            and coalesce(m.management_level,'')<>'General Manager'
            and coalesce(m.profile_id<>p.id,true));
    else
      can_approve := p.role::text='admin';
    end if;

    if action='cancel' then
      if req.status not in ('pending','approved') then raise exception 'Only pending or approved requests can be cancelled'; end if;
      if req.requester_id<>p.id and not can_approve then raise exception 'Cancellation access denied'; end if;
      update public.payroll_time_off
        set status='cancelled',review_note=left(coalesce(payload->>'review_note',''),2000),
            reviewed_by=p.id,reviewed_at=now(),updated_at=now()
        where id=req.id;
      delete from public.labor_time_off where source_time_off_request_id=req.id;
      return jsonb_build_object('ok',true,'id',req.id,'status','cancelled');
    end if;

    if req.status<>'pending' or payload->>'status' not in ('approved','declined') then
      raise exception 'Request is no longer pending';
    end if;
    if not can_approve then raise exception 'Review access denied'; end if;

    if payload->>'status'='approved' then
      benefit_year := extract(year from req.start_date)::integer;
      select coalesce(case when req.kind='PTO' then b.pto_hours else b.vacation_hours end,0)
        into allocated_hours
      from public.team_leave_balances b
      where b.benefit_year=benefit_year
        and ((req.member_id is not null and b.member_id=req.member_id)
          or (req.beneficiary_profile_id is not null and b.profile_id=req.beneficiary_profile_id));
      allocated_hours := coalesce(allocated_hours,0);
      select coalesce(sum(r.hours),0) into committed_hours
      from public.payroll_time_off r
      where r.id<>req.id and r.kind=req.kind and r.status in ('pending','approved')
        and extract(year from r.start_date)::integer=benefit_year
        and ((req.member_id is not null and r.member_id=req.member_id)
          or (req.beneficiary_profile_id is not null and r.beneficiary_profile_id=req.beneficiary_profile_id));
      if req.hours > allocated_hours-committed_hours then raise exception 'The available balance changed and no longer covers this request'; end if;

      update public.payroll_time_off
        set status='approved',review_note=left(coalesce(payload->>'review_note',''),2000),
            reviewed_by=p.id,reviewed_at=now(),updated_at=now()
        where id=req.id;
      if req.member_id is not null then
        insert into public.labor_time_off(store_id,member_id,week_start,day_of_week,start_time,end_time,reason,source_time_off_request_id)
        select req.store_id,req.member_id,
          work_day::date - (extract(isodow from work_day)::integer - 1),
          extract(isodow from work_day)::integer - 1,
          req.unavailable_start,req.unavailable_end,
          req.kind || ' approved · ' || req.hours || ' hours',
          req.id
        from generate_series(req.start_date,req.end_date,interval '1 day') work_day
        on conflict (source_time_off_request_id,week_start,day_of_week)
          where source_time_off_request_id is not null do nothing;
      end if;
    else
      update public.payroll_time_off
        set status='declined',review_note=left(coalesce(payload->>'review_note',''),2000),
            reviewed_by=p.id,reviewed_at=now(),updated_at=now()
        where id=req.id;
    end if;
    return jsonb_build_object('ok',true,'id',req.id,'status',payload->>'status');
  end if;

  raise exception 'Unknown leave action';
end
$$;

revoke all on function public.leave_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.leave_action(uuid,text,jsonb) to service_role;

comment on table public.team_leave_balances is
  'Annual PTO and Vacation allocations. Availability is allocation minus pending reservations and approved usage.';
comment on column public.labor_team_members.management_level is
  'Management progression used for leave routing and leadership reporting; scheduling role remains manager.';
comment on column public.labor_time_off.source_time_off_request_id is
  'Links an approved PTO/Vacation request to the one-time scheduler restriction it generated.';

