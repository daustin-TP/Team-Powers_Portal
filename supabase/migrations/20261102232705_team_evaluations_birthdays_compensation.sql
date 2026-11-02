-- Private employment details, position-specific compensation, and monthly evaluations.
-- Birth years and compensation never live on the generally readable scheduling roster.

create table public.team_member_private_details (
  member_id uuid primary key references public.labor_team_members(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  hire_date date,
  rehire_date date,
  evaluation_anniversary date,
  birth_date date,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_member_positions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.labor_team_members(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  position_name text not null check (length(trim(position_name)) between 1 and 80),
  hourly_rate numeric(8,2) check (hourly_rate is null or hourly_rate >= 0),
  effective_date date not null default current_date,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index team_member_positions_active_unique
  on public.team_member_positions(member_id, lower(position_name)) where active;
create index team_member_positions_store_member_idx
  on public.team_member_positions(store_id, member_id, active);

create table public.team_evaluations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  member_id uuid not null references public.labor_team_members(id) on delete restrict,
  evaluation_type text not null default 'annual'
    check (evaluation_type in ('90_day','annual','30_day_follow_up','other')),
  due_date date not null,
  evaluation_date date,
  status text not null default 'draft' check (status in ('draft','completed')),
  evaluator_id uuid not null references public.profiles(id),
  evaluator_name text not null,
  attendance_absences integer not null default 0 check (attendance_absences >= 0),
  attendance_tardies integer not null default 0 check (attendance_tardies >= 0),
  competency_ratings jsonb not null default '{}'::jsonb,
  total_score integer,
  manager_notes text not null default '',
  development_goals text not null default '',
  next_evaluation_type text check (next_evaluation_type is null or next_evaluation_type in ('30_day_follow_up','annual','none')),
  next_evaluation_date date,
  wage_review jsonb not null default '[]'::jsonb,
  include_wage_on_print boolean not null default false,
  employee_acknowledged boolean not null default false,
  employee_acknowledged_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index team_evaluations_store_due_idx on public.team_evaluations(store_id, due_date, status);
create index team_evaluations_member_idx on public.team_evaluations(member_id, evaluation_date desc nulls last);

create table public.team_evaluation_activity (
  id bigint generated always as identity primary key,
  evaluation_id uuid not null references public.team_evaluations(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  actor_name text not null,
  action text not null check (action in ('created','updated','completed','reopened')),
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.team_member_private_details enable row level security;
alter table public.team_member_positions enable row level security;
alter table public.team_evaluations enable row level security;
alter table public.team_evaluation_activity enable row level security;

grant select, insert, update on public.team_member_private_details to authenticated;
grant select, insert, update on public.team_member_positions to authenticated;
grant select, insert, update on public.team_evaluations to authenticated;
grant select on public.team_evaluation_activity to authenticated;
grant usage, select on sequence public.team_evaluation_activity_id_seq to authenticated;

create policy "leaders read private team details"
on public.team_member_private_details for select to authenticated
using (
  (select public.current_portal_role()) in ('manager','supervisor','admin')
  and (select public.can_access_store(store_id))
);
create policy "leaders manage private team details"
on public.team_member_private_details for all to authenticated
using (
  (select public.current_portal_role()) in ('manager','supervisor','admin')
  and (select public.can_access_store(store_id))
)
with check (
  (select public.current_portal_role()) in ('manager','supervisor','admin')
  and (select public.can_access_store(store_id))
);

create policy "leaders read team positions"
on public.team_member_positions for select to authenticated
using (
  (select public.current_portal_role()) in ('manager','supervisor','admin')
  and (select public.can_access_store(store_id))
);
create policy "leaders manage team positions"
on public.team_member_positions for all to authenticated
using (
  (select public.current_portal_role()) in ('manager','supervisor','admin')
  and (select public.can_access_store(store_id))
)
with check (
  (select public.current_portal_role()) in ('manager','supervisor','admin')
  and (select public.can_access_store(store_id))
);

create policy "leaders read team evaluations"
on public.team_evaluations for select to authenticated
using (
  (select public.current_portal_role()) in ('manager','supervisor','admin')
  and (select public.can_access_store(store_id))
);
create policy "leaders create team evaluations"
on public.team_evaluations for insert to authenticated
with check (
  (select public.current_portal_role()) in ('manager','supervisor','admin')
  and (select public.can_access_store(store_id))
  and evaluator_id = (select auth.uid())
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
);
create policy "leaders update team evaluations"
on public.team_evaluations for update to authenticated
using (
  (select public.current_portal_role()) in ('manager','supervisor','admin')
  and (select public.can_access_store(store_id))
)
with check (
  (select public.current_portal_role()) in ('manager','supervisor','admin')
  and (select public.can_access_store(store_id))
  and updated_by = (select auth.uid())
);

create policy "leaders read evaluation activity"
on public.team_evaluation_activity for select to authenticated
using (
  (select public.current_portal_role()) in ('manager','supervisor','admin')
  and (select public.can_access_store(store_id))
);

create or replace function public.record_team_evaluation_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  activity_action text;
  activity_actor_name text;
begin
  if tg_op = 'INSERT' then
    activity_action := case when new.status = 'completed' then 'completed' else 'created' end;
  elsif old.status = 'draft' and new.status = 'completed' then
    activity_action := 'completed';
  elsif old.status = 'completed' and new.status = 'draft' then
    activity_action := 'reopened';
  else
    activity_action := 'updated';
  end if;

  select coalesce(full_name, email, 'Team Powers leader') into activity_actor_name
  from public.profiles where id = new.updated_by;

  insert into public.team_evaluation_activity
    (evaluation_id, store_id, actor_id, actor_name, action, snapshot)
  values
    (new.id, new.store_id, new.updated_by, coalesce(activity_actor_name, 'Team Powers leader'), activity_action, to_jsonb(new));
  return new;
end;
$$;

revoke all on function public.record_team_evaluation_activity() from public, anon, authenticated;
drop trigger if exists record_team_evaluation_activity on public.team_evaluations;
create trigger record_team_evaluation_activity
after insert or update on public.team_evaluations
for each row execute function public.record_team_evaluation_activity();
