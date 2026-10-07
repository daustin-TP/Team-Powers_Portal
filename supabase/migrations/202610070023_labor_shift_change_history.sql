-- Durable, store-visible audit history for changes to automatically generated shifts.

create table if not exists public.labor_shift_changes (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  week_plan_id uuid not null references public.labor_week_plans(id) on delete cascade,
  shift_id uuid references public.labor_shifts(id) on delete set null,
  day_of_week integer not null check (day_of_week between 0 and 6),
  role text not null check (role in ('manager','insider','driver')),
  change_type text not null check (change_type in ('time_edited','manual_added','removed')),
  change_summary text not null,
  before_state jsonb,
  after_state jsonb,
  changed_by uuid not null references public.profiles(id),
  changed_by_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists labor_shift_changes_plan_idx
  on public.labor_shift_changes(week_plan_id, created_at desc);
create index if not exists labor_shift_changes_shift_idx
  on public.labor_shift_changes(shift_id, created_at desc);

alter table public.labor_shift_changes enable row level security;

drop policy if exists "store users read labor shift changes" on public.labor_shift_changes;
create policy "store users read labor shift changes"
on public.labor_shift_changes for select to authenticated
using (public.can_access_store(store_id));

drop policy if exists "store leaders create labor shift changes" on public.labor_shift_changes;
create policy "store leaders create labor shift changes"
on public.labor_shift_changes for insert to authenticated
with check (
  public.can_access_store(store_id)
  and changed_by = auth.uid()
  and public.current_portal_role() in ('manager','supervisor','admin')
);

do $$
begin
  alter publication supabase_realtime add table public.labor_shift_changes;
exception when duplicate_object then null;
end $$;

create or replace function public.mutate_labor_shift(
  p_action text,
  p_week_plan_id uuid,
  p_shift_id uuid default null,
  p_day_of_week integer default null,
  p_role text default null,
  p_start_time time default null,
  p_end_time time default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_store_id uuid;
  v_actor_name text;
  v_before public.labor_shifts%rowtype;
  v_after public.labor_shifts%rowtype;
  v_summary text;
begin
  select store_id into v_store_id from public.labor_week_plans where id = p_week_plan_id;
  if v_store_id is null then raise exception 'Schedule week was not found.'; end if;
  if not public.can_access_store(v_store_id) or public.current_portal_role() not in ('manager','supervisor','admin') then
    raise exception 'You do not have permission to change this schedule.';
  end if;
  select full_name into v_actor_name from public.profiles where id = auth.uid() and active = true;
  if v_actor_name is null then raise exception 'An active portal profile is required.'; end if;

  if p_action = 'edit_time' then
    select * into v_before from public.labor_shifts where id = p_shift_id and week_plan_id = p_week_plan_id for update;
    if v_before.id is null then raise exception 'Shift was not found.'; end if;
    if p_start_time is null or p_end_time is null or p_start_time = p_end_time then raise exception 'Valid start and end times are required.'; end if;
    update public.labor_shifts set start_time = p_start_time, end_time = p_end_time, source = 'manual', updated_at = now()
      where id = p_shift_id returning * into v_after;
    v_summary := format('Time changed from %s–%s to %s–%s', trim(to_char(v_before.start_time, 'HH12:MI AM')), trim(to_char(v_before.end_time, 'HH12:MI AM')), trim(to_char(v_after.start_time, 'HH12:MI AM')), trim(to_char(v_after.end_time, 'HH12:MI AM')));
    insert into public.labor_shift_changes(store_id,week_plan_id,shift_id,day_of_week,role,change_type,change_summary,before_state,after_state,changed_by,changed_by_name)
      values(v_store_id,p_week_plan_id,v_after.id,v_after.day_of_week,v_after.role,'time_edited',v_summary,to_jsonb(v_before),to_jsonb(v_after),auth.uid(),v_actor_name);
  elsif p_action = 'add' then
    if p_day_of_week is null or p_day_of_week not between 0 and 6 or p_role is null or p_role not in ('manager','insider','driver') or p_start_time is null or p_end_time is null or p_start_time = p_end_time then raise exception 'A valid day, role, start, and end are required.'; end if;
    insert into public.labor_shifts(week_plan_id,day_of_week,role,start_time,end_time,assigned_member_id,source,notes)
      values(p_week_plan_id,p_day_of_week,p_role,p_start_time,p_end_time,null,'manual','Manager-added coverage') returning * into v_after;
    v_summary := format('%s shift added for %s–%s', initcap(v_after.role), trim(to_char(v_after.start_time, 'HH12:MI AM')), trim(to_char(v_after.end_time, 'HH12:MI AM')));
    insert into public.labor_shift_changes(store_id,week_plan_id,shift_id,day_of_week,role,change_type,change_summary,before_state,after_state,changed_by,changed_by_name)
      values(v_store_id,p_week_plan_id,v_after.id,v_after.day_of_week,v_after.role,'manual_added',v_summary,null,to_jsonb(v_after),auth.uid(),v_actor_name);
  elsif p_action = 'remove' then
    select * into v_before from public.labor_shifts where id = p_shift_id and week_plan_id = p_week_plan_id for update;
    if v_before.id is null then raise exception 'Shift was not found.'; end if;
    v_summary := format('%s shift removed (%s–%s)', initcap(v_before.role), trim(to_char(v_before.start_time, 'HH12:MI AM')), trim(to_char(v_before.end_time, 'HH12:MI AM')));
    insert into public.labor_shift_changes(store_id,week_plan_id,shift_id,day_of_week,role,change_type,change_summary,before_state,after_state,changed_by,changed_by_name)
      values(v_store_id,p_week_plan_id,v_before.id,v_before.day_of_week,v_before.role,'removed',v_summary,to_jsonb(v_before),null,auth.uid(),v_actor_name);
    delete from public.labor_shifts where id = p_shift_id;
    v_after := v_before;
  else
    raise exception 'Unsupported shift action.';
  end if;

  update public.labor_week_plans set status = 'draft', published_at = null, updated_at = now() where id = p_week_plan_id;
  return to_jsonb(v_after);
end;
$$;

revoke all on function public.mutate_labor_shift(text,uuid,uuid,integer,text,time,time) from public;
grant execute on function public.mutate_labor_shift(text,uuid,uuid,integer,text,time,time) to authenticated;
