alter table public.labor_team_members
  add column if not exists access_email text;

create unique index if not exists labor_team_members_access_email_unique
  on public.labor_team_members (lower(access_email))
  where access_email is not null and btrim(access_email) <> '';

create table if not exists public.team_member_availability_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.labor_team_members(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  request_kind text not null check (request_kind in ('one_time','recurring')),
  selected_dates date[] not null default '{}',
  selected_weekdays integer[] not null default '{}',
  all_day boolean not null default true,
  start_time time not null default time '00:00',
  end_time time not null default time '23:59',
  note text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','denied','cancelled')),
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  review_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (request_kind = 'one_time' and cardinality(selected_dates) > 0 and cardinality(selected_weekdays) = 0)
    or (request_kind = 'recurring' and cardinality(selected_weekdays) > 0 and cardinality(selected_dates) = 0)
  ),
  check (end_time > start_time or (all_day and start_time = time '00:00' and end_time = time '23:59'))
);

create index if not exists team_member_availability_requests_member_idx
  on public.team_member_availability_requests(member_id, created_at desc);
create index if not exists team_member_availability_requests_store_status_idx
  on public.team_member_availability_requests(store_id, status, created_at desc);

alter table public.labor_time_off
  add column if not exists source_availability_request_id uuid
    references public.team_member_availability_requests(id) on delete restrict;

create unique index if not exists labor_time_off_availability_request_day_idx
  on public.labor_time_off(source_availability_request_id, week_start, day_of_week)
  where source_availability_request_id is not null;

alter table public.team_member_availability_requests enable row level security;
revoke all on public.team_member_availability_requests from anon, authenticated;
grant all on public.team_member_availability_requests to service_role;

create or replace function public.team_member_portal_action(action text, payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  email_value text := lower(btrim(coalesce(auth.jwt()->>'email','')));
  m public.labor_team_members%rowtype;
  p public.profiles%rowtype;
  req public.team_member_availability_requests%rowtype;
  store_row public.stores%rowtype;
  scoped uuid[];
  request_id uuid;
  kind_value text;
  dates_value date[];
  weekdays_value integer[];
  all_day_value boolean;
  start_clock time;
  end_clock time;
  note_value text;
  review_value text;
  work_day date;
  weekday_value integer;
  response jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;

  if action in ('session','dashboard','submit','cancel') then
    select * into m
    from public.labor_team_members
    where lower(access_email) = email_value
      and active
      and employment_status in ('active','borrowed')
    limit 1;
    if m.id is null then raise exception 'Employee access is not active'; end if;
    select * into store_row from public.stores where id = m.store_id;

    if action = 'session' then
      return jsonb_build_object('member', jsonb_build_object(
        'id',m.id,'display_name',m.display_name,'store_id',m.store_id,
        'store_name',store_row.name,'access_email',m.access_email
      ));
    end if;

    if action = 'dashboard' then
      select jsonb_build_object(
        'member', jsonb_build_object('id',m.id,'display_name',m.display_name,'store_id',m.store_id,'store_name',store_row.name,'access_email',m.access_email),
        'requests', coalesce((
          select jsonb_agg(to_jsonb(r) order by r.created_at desc)
          from public.team_member_availability_requests r where r.member_id=m.id
        ),'[]'::jsonb),
        'weeks', coalesce((
          select jsonb_agg(week_row order by week_row->>'week_start')
          from (
            select jsonb_build_object(
              'week_start',wp.week_start,
              'shifts',coalesce((select jsonb_agg(jsonb_build_object(
                'id',s.id,'day_of_week',s.day_of_week,'role',s.role,
                'start_time',s.start_time,'end_time',s.end_time
              ) order by s.day_of_week,s.start_time) from public.labor_shifts s
                where s.week_plan_id=wp.id and s.assigned_member_id=m.id),'[]'::jsonb)
            ) week_row
            from public.labor_week_plans wp
            where wp.store_id=m.store_id and wp.status='published'
              and wp.week_start >= current_date - 7 and wp.week_start <= current_date + 42
          ) published_weeks
        ),'[]'::jsonb)
      ) into response;
      return response;
    end if;

    if action = 'submit' then
      kind_value := payload->>'request_kind';
      all_day_value := coalesce((payload->>'all_day')::boolean,true);
      start_clock := case when all_day_value then time '00:00' else (payload->>'start_time')::time end;
      end_clock := case when all_day_value then time '23:59' else (payload->>'end_time')::time end;
      note_value := left(btrim(coalesce(payload->>'note','')),2000);
      if kind_value = 'one_time' then
        select array_agg(distinct value::date order by value::date) into dates_value
        from jsonb_array_elements_text(coalesce(payload->'selected_dates','[]'::jsonb));
        weekdays_value := '{}';
        if coalesce(cardinality(dates_value),0) = 0 or cardinality(dates_value) > 31
           or exists(select 1 from unnest(dates_value) d where d < current_date) then
          raise exception 'Choose between 1 and 31 current or future dates';
        end if;
      elsif kind_value = 'recurring' then
        select array_agg(distinct value::integer order by value::integer) into weekdays_value
        from jsonb_array_elements_text(coalesce(payload->'selected_weekdays','[]'::jsonb));
        dates_value := '{}';
        if coalesce(cardinality(weekdays_value),0) = 0
           or exists(select 1 from unnest(weekdays_value) d where d not between 0 and 6) then
          raise exception 'Choose at least one weekday';
        end if;
      else
        raise exception 'Choose a valid request type';
      end if;
      if not all_day_value and (start_clock is null or end_clock is null or end_clock <= start_clock) then
        raise exception 'Choose a valid unavailable time range';
      end if;
      insert into public.team_member_availability_requests(
        member_id,store_id,request_kind,selected_dates,selected_weekdays,all_day,start_time,end_time,note
      ) values(m.id,m.store_id,kind_value,dates_value,weekdays_value,all_day_value,start_clock,end_clock,note_value)
      returning id into request_id;
      return jsonb_build_object('ok',true,'request_id',request_id);
    end if;

    request_id := nullif(payload->>'request_id','')::uuid;
    update public.team_member_availability_requests
      set status='cancelled',updated_at=now()
      where id=request_id and member_id=m.id and status='pending';
    if not found then raise exception 'Only your pending requests can be cancelled'; end if;
    return jsonb_build_object('ok',true);
  end if;

  select * into p from public.profiles where id=auth.uid() and active;
  if p.id is null or p.role::text not in ('manager','supervisor','admin') then
    raise exception 'Manager access is required';
  end if;
  select array_agg(distinct sid) into scoped from (
    select p.store_id sid union select store_id from public.profile_store_assignments where profile_id=p.id
  ) x where sid is not null;

  if action = 'manager_list' then
    request_id := null;
    if nullif(payload->>'store_id','') is null then raise exception 'Choose a store'; end if;
    if p.role::text <> 'admin' and not coalesce((payload->>'store_id')::uuid=any(scoped),false) then raise exception 'Store access denied'; end if;
    return jsonb_build_object('requests',coalesce((
      select jsonb_agg(to_jsonb(r) || jsonb_build_object('member_name',tm.display_name,'member_email',tm.access_email) order by (r.status='pending') desc,r.created_at desc)
      from public.team_member_availability_requests r
      join public.labor_team_members tm on tm.id=r.member_id
      where r.store_id=(payload->>'store_id')::uuid
    ),'[]'::jsonb));
  end if;

  if action = 'review' then
    request_id := nullif(payload->>'request_id','')::uuid;
    select * into req from public.team_member_availability_requests where id=request_id for update;
    if req.id is null or req.status <> 'pending' then raise exception 'This request is no longer pending'; end if;
    if p.role::text <> 'admin' and not coalesce(req.store_id=any(scoped),false) then raise exception 'Store access denied'; end if;
    kind_value := payload->>'decision';
    review_value := left(btrim(coalesce(payload->>'review_note','')),1000);
    if kind_value not in ('approved','denied') then raise exception 'Choose approve or deny'; end if;

    if kind_value='approved' then
      if req.request_kind='one_time' then
        foreach work_day in array req.selected_dates loop
          insert into public.labor_time_off(store_id,member_id,week_start,day_of_week,start_time,end_time,reason,source_availability_request_id)
          values(req.store_id,req.member_id,work_day-(extract(isodow from work_day)::integer-1),extract(isodow from work_day)::integer-1,
            req.start_time,req.end_time,coalesce(nullif(req.note,''),'Approved team member request'),req.id)
          on conflict (source_availability_request_id,week_start,day_of_week) where source_availability_request_id is not null do nothing;
        end loop;
      else
        foreach weekday_value in array req.selected_weekdays loop
          delete from public.labor_standard_availability where store_id=req.store_id and member_id=req.member_id and day_of_week=weekday_value;
          insert into public.labor_standard_availability(store_id,member_id,day_of_week,start_time,end_time,available)
          values(req.store_id,req.member_id,weekday_value,req.start_time,req.end_time,false);
        end loop;
      end if;
    end if;
    update public.team_member_availability_requests set status=kind_value,reviewed_by=p.id,reviewed_at=now(),review_note=review_value,updated_at=now() where id=req.id;
    return jsonb_build_object('ok',true,'status',kind_value);
  end if;
  raise exception 'Unknown portal action';
end;
$$;

revoke all on function public.team_member_portal_action(text,jsonb) from public, anon;
grant execute on function public.team_member_portal_action(text,jsonb) to authenticated;

