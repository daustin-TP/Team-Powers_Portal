-- Confidential, permanent disciplinary records.
-- Managers may submit for an assigned store and read only their own submissions.
-- Supervisors and administrators may read and edit every record. Nobody may delete.

create schema if not exists private;

create table public.hr_disciplinary_actions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  employee_name text not null check (length(trim(employee_name)) between 2 and 160),
  employee_identifier text,
  incident_date date not null,
  action_type text not null check (action_type in (
    'coaching', 'verbal_warning', 'written_warning', 'final_warning',
    'suspension', 'termination'
  )),
  policy_category text not null default 'other' check (policy_category in (
    'attendance', 'conduct', 'performance', 'safety', 'cash_handling',
    'food_safety', 'harassment', 'insubordination', 'other'
  )),
  incident_summary text not null check (length(trim(incident_summary)) between 10 and 10000),
  action_taken text not null check (length(trim(action_taken)) between 5 and 10000),
  expectations text not null default '',
  follow_up_date date,
  witnesses text not null default '',
  acknowledgment_status text not null default 'pending' check (acknowledgment_status in (
    'pending', 'acknowledged', 'declined', 'not_required'
  )),
  status text not null default 'open' check (status in ('open', 'monitoring', 'completed')),
  confidential_notes text not null default '',
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  submitted_by_name text not null,
  last_edited_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_follow_up_after_incident check (
    follow_up_date is null or follow_up_date >= incident_date
  )
);

create table public.hr_disciplinary_action_revisions (
  id bigint generated always as identity primary key,
  action_id uuid not null references public.hr_disciplinary_actions(id) on delete restrict,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  changed_by_name text not null,
  before_state jsonb not null,
  after_state jsonb not null,
  created_at timestamptz not null default now()
);

create index hr_disciplinary_actions_store_incident_idx
  on public.hr_disciplinary_actions(store_id, incident_date desc);
create index hr_disciplinary_actions_submitter_created_idx
  on public.hr_disciplinary_actions(submitted_by, created_at desc);
create index hr_disciplinary_actions_status_idx
  on public.hr_disciplinary_actions(status, updated_at desc);
create index hr_disciplinary_action_revisions_action_idx
  on public.hr_disciplinary_action_revisions(action_id, created_at desc);
create index hr_disciplinary_action_revisions_actor_idx
  on public.hr_disciplinary_action_revisions(changed_by, created_at desc);

alter table public.hr_disciplinary_actions enable row level security;
alter table public.hr_disciplinary_action_revisions enable row level security;

create policy "submitters and hr leaders read disciplinary actions"
on public.hr_disciplinary_actions for select to authenticated
using (
  submitted_by = (select auth.uid())
  or (select public.current_portal_role()) in ('supervisor', 'admin')
);

create policy "leaders submit disciplinary actions"
on public.hr_disciplinary_actions for insert to authenticated
with check (
  submitted_by = (select auth.uid())
  and (select public.current_portal_role()) in ('manager', 'supervisor', 'admin')
  and (
    (select public.current_portal_role()) in ('supervisor', 'admin')
    or (select public.can_access_store(store_id))
  )
);

create policy "hr leaders update disciplinary actions"
on public.hr_disciplinary_actions for update to authenticated
using ((select public.current_portal_role()) in ('supervisor', 'admin'))
with check ((select public.current_portal_role()) in ('supervisor', 'admin'));

create policy "submitters and hr leaders read disciplinary revisions"
on public.hr_disciplinary_action_revisions for select to authenticated
using (
  exists (
    select 1
    from public.hr_disciplinary_actions action
    where action.id = action_id
      and (
        action.submitted_by = (select auth.uid())
        or (select public.current_portal_role()) in ('supervisor', 'admin')
      )
  )
);

grant select, insert, update on public.hr_disciplinary_actions to authenticated;
revoke delete on public.hr_disciplinary_actions from authenticated;
grant select on public.hr_disciplinary_action_revisions to authenticated;
revoke insert, update, delete on public.hr_disciplinary_action_revisions from authenticated;

create or replace function private.prepare_hr_disciplinary_action_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  -- Permanent record identity and ownership may never be rewritten.
  new.id := old.id;
  new.store_id := old.store_id;
  new.submitted_by := old.submitted_by;
  new.submitted_by_name := old.submitted_by_name;
  new.created_at := old.created_at;
  new.last_edited_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.audit_hr_disciplinary_action_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  actor_name text;
begin
  select full_name into actor_name
  from public.profiles
  where id = auth.uid() and active = true;

  insert into public.hr_disciplinary_action_revisions (
    action_id, changed_by, changed_by_name, before_state, after_state
  ) values (
    new.id,
    auth.uid(),
    coalesce(actor_name, 'Unknown user'),
    to_jsonb(old),
    to_jsonb(new)
  );
  return new;
end;
$$;

revoke all on function private.prepare_hr_disciplinary_action_update() from public;
revoke all on function private.audit_hr_disciplinary_action_update() from public;

create trigger hr_disciplinary_action_prepare_update
before update on public.hr_disciplinary_actions
for each row execute function private.prepare_hr_disciplinary_action_update();

create trigger hr_disciplinary_action_audit_update
after update on public.hr_disciplinary_actions
for each row execute function private.audit_hr_disciplinary_action_update();

comment on table public.hr_disciplinary_actions is
  'Confidential permanent employee disciplinary records; deletion is intentionally unavailable.';
comment on table public.hr_disciplinary_action_revisions is
  'Immutable before-and-after audit history for disciplinary record edits.';
