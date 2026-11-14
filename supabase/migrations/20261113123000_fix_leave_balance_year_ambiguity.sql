create or replace function public.leave_save_balance(actor uuid, payload jsonb)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  actor_profile public.profiles%rowtype;
  roster_member public.labor_team_members%rowtype;
  leader_profile public.profiles%rowtype;
  target_member_id uuid;
  target_profile_id uuid;
  target_benefit_year integer;
  pto_value numeric(8,2);
  vacation_value numeric(8,2);
  committed_hours numeric(8,2);
begin
  select * into actor_profile
  from public.profiles
  where id = actor and active;

  if actor_profile.id is null or actor_profile.role::text <> 'admin' then
    raise exception 'Only administrators can assign PTO and Vacation balances';
  end if;

  target_benefit_year := (payload->>'benefit_year')::integer;
  target_member_id := nullif(payload->>'member_id','')::uuid;
  target_profile_id := nullif(payload->>'profile_id','')::uuid;
  pto_value := coalesce((payload->>'pto_hours')::numeric, 0);
  vacation_value := coalesce((payload->>'vacation_hours')::numeric, 0);

  if target_benefit_year not between 2026 and 2100
     or (target_member_id is null) = (target_profile_id is null)
     or pto_value < 0 or vacation_value < 0
     or pto_value <> trunc(pto_value) or vacation_value <> trunc(vacation_value) then
    raise exception 'Enter valid whole-hour annual balances';
  end if;

  if target_member_id is not null then
    select * into roster_member
    from public.labor_team_members
    where id = target_member_id;

    if roster_member.id is null or not ('manager' = any(roster_member.qualified_roles)) then
      raise exception 'Choose a manager-qualified roster employee';
    end if;
  else
    select * into leader_profile
    from public.profiles
    where id = target_profile_id and active;

    if leader_profile.id is null or leader_profile.role::text not in ('supervisor','admin') then
      raise exception 'Choose an active above-store leader';
    end if;
  end if;

  select coalesce(sum(r.hours), 0) into committed_hours
  from public.payroll_time_off r
  where r.kind = 'PTO'
    and r.status in ('pending','approved')
    and extract(year from r.start_date)::integer = target_benefit_year
    and ((target_member_id is not null and r.member_id = target_member_id)
      or (target_profile_id is not null and r.beneficiary_profile_id = target_profile_id));

  if pto_value < committed_hours then
    raise exception 'PTO allocation cannot be below pending and approved requests';
  end if;

  select coalesce(sum(r.hours), 0) into committed_hours
  from public.payroll_time_off r
  where r.kind = 'Vacation'
    and r.status in ('pending','approved')
    and extract(year from r.start_date)::integer = target_benefit_year
    and ((target_member_id is not null and r.member_id = target_member_id)
      or (target_profile_id is not null and r.beneficiary_profile_id = target_profile_id));

  if vacation_value < committed_hours then
    raise exception 'Vacation allocation cannot be below pending and approved requests';
  end if;

  if target_member_id is not null then
    insert into public.team_leave_balances(benefit_year, member_id, pto_hours, vacation_hours, updated_by)
    values(target_benefit_year, target_member_id, pto_value, vacation_value, actor_profile.id)
    on conflict (member_id, benefit_year) where member_id is not null
    do update set
      pto_hours = excluded.pto_hours,
      vacation_hours = excluded.vacation_hours,
      updated_by = actor_profile.id,
      updated_at = now();
  else
    insert into public.team_leave_balances(benefit_year, profile_id, pto_hours, vacation_hours, updated_by)
    values(target_benefit_year, target_profile_id, pto_value, vacation_value, actor_profile.id)
    on conflict (profile_id, benefit_year) where profile_id is not null
    do update set
      pto_hours = excluded.pto_hours,
      vacation_hours = excluded.vacation_hours,
      updated_by = actor_profile.id,
      updated_at = now();
  end if;

  return jsonb_build_object('ok', true);
end
$function$;

revoke all on function public.leave_save_balance(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.leave_save_balance(uuid,jsonb) to service_role;
