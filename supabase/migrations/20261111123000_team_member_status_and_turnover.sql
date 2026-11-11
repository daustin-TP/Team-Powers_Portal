-- Permanent employment-status history, termination linkage, and test-mode HR notifications.

alter table public.labor_team_members
  add column if not exists employment_status text,
  add column if not exists home_store_id uuid references public.stores(id) on delete set null,
  add column if not exists status_reason text not null default '',
  add column if not exists status_effective_date date,
  add column if not exists status_notes text not null default '',
  add column if not exists linked_hr_action_id uuid references public.hr_disciplinary_actions(id) on delete set null,
  add column if not exists status_changed_by uuid references public.profiles(id) on delete set null,
  add column if not exists status_changed_at timestamptz;

update public.labor_team_members
set employment_status = case when active then 'active' else 'archived' end,
    status_effective_date = coalesce(status_effective_date, created_at::date),
    status_changed_at = coalesce(status_changed_at, updated_at, created_at)
where employment_status is null;

alter table public.labor_team_members
  alter column employment_status set default 'active',
  alter column employment_status set not null;

alter table public.labor_team_members
  drop constraint if exists labor_team_members_employment_status_check;
alter table public.labor_team_members
  add constraint labor_team_members_employment_status_check
  check (employment_status in ('active','on_leave','borrowed','terminated','archived'));

alter table public.hr_disciplinary_actions
  add column if not exists member_id uuid references public.labor_team_members(id) on delete restrict;

create index if not exists labor_team_members_store_status_idx
  on public.labor_team_members(store_id, employment_status, display_name);
create index if not exists hr_disciplinary_actions_member_idx
  on public.hr_disciplinary_actions(member_id, incident_date desc)
  where member_id is not null;

create table if not exists public.team_member_status_history (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.labor_team_members(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  from_status text,
  to_status text not null check (to_status in ('active','on_leave','borrowed','terminated','archived')),
  effective_date date not null,
  reason text not null default '',
  notes text not null default '',
  hr_action_id uuid references public.hr_disciplinary_actions(id) on delete set null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  check (from_status is null or from_status in ('active','on_leave','borrowed','terminated','archived'))
);

create index if not exists team_member_status_history_store_date_idx
  on public.team_member_status_history(store_id, effective_date, to_status);
create index if not exists team_member_status_history_member_date_idx
  on public.team_member_status_history(member_id, effective_date desc, changed_at desc);

insert into public.team_member_status_history (
  member_id, store_id, from_status, to_status, effective_date, reason, notes, hr_action_id, changed_by, changed_at
)
select m.id, m.store_id, null, m.employment_status,
  coalesce(m.status_effective_date, m.created_at::date),
  case when m.employment_status = 'archived' then 'Legacy inactive roster record' else 'DASH baseline' end,
  m.status_notes, m.linked_hr_action_id, m.status_changed_by,
  coalesce(m.status_changed_at, m.created_at)
from public.labor_team_members m
where not exists (
  select 1 from public.team_member_status_history h where h.member_id = m.id
);

create or replace function private.prepare_team_member_status_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.employment_status is distinct from old.employment_status then
    new.active := new.employment_status in ('active','borrowed');
    new.status_effective_date := coalesce(new.status_effective_date, current_date);
    new.status_changed_by := coalesce(auth.uid(), new.status_changed_by);
    new.status_changed_at := now();
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function private.audit_team_member_status_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.employment_status is distinct from old.employment_status then
    insert into public.team_member_status_history (
      member_id, store_id, from_status, to_status, effective_date,
      reason, notes, hr_action_id, changed_by, changed_at
    ) values (
      new.id, new.store_id, old.employment_status, new.employment_status,
      coalesce(new.status_effective_date, current_date), new.status_reason,
      new.status_notes, new.linked_hr_action_id,
      coalesce(auth.uid(), new.status_changed_by), now()
    );
  end if;
  return new;
end;
$$;

revoke all on function private.prepare_team_member_status_change() from public;
revoke all on function private.audit_team_member_status_change() from public;

drop trigger if exists team_member_status_prepare on public.labor_team_members;
create trigger team_member_status_prepare
before update of employment_status on public.labor_team_members
for each row execute function private.prepare_team_member_status_change();

drop trigger if exists team_member_status_audit on public.labor_team_members;
create trigger team_member_status_audit
after update of employment_status on public.labor_team_members
for each row execute function private.audit_team_member_status_change();

create table if not exists public.hr_notification_settings (
  id boolean primary key default true check (id),
  delivery_mode text not null default 'test' check (delivery_mode in ('test','live')),
  test_recipients text[] not null default '{}',
  live_recipients text[] not null default '{}',
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.hr_notification_settings (id, delivery_mode, test_recipients, live_recipients)
values (true, 'test', array['daustin@powerspizza.com']::text[], array[]::text[])
on conflict (id) do nothing;

create table if not exists public.hr_termination_notifications (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.hr_disciplinary_actions(id) on delete restrict,
  member_id uuid not null references public.labor_team_members(id) on delete restrict,
  recipient_email text not null,
  delivery_mode text not null check (delivery_mode in ('test','live')),
  status text not null default 'sending' check (status in ('sending','sent','failed')),
  provider_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique(action_id, recipient_email, delivery_mode)
);
create index if not exists hr_notification_settings_updated_by_idx on public.hr_notification_settings(updated_by) where updated_by is not null;
create index if not exists hr_termination_notifications_member_idx on public.hr_termination_notifications(member_id);

alter table public.team_member_status_history enable row level security;
alter table public.hr_notification_settings enable row level security;
alter table public.hr_termination_notifications enable row level security;

revoke all on table public.team_member_status_history, public.hr_notification_settings, public.hr_termination_notifications from anon, authenticated;
grant select, insert on table public.team_member_status_history to authenticated;
grant select, update on table public.hr_notification_settings to authenticated;
grant all on table public.team_member_status_history, public.hr_notification_settings, public.hr_termination_notifications to service_role;

drop policy if exists "store leaders read employment history" on public.team_member_status_history;
create policy "store leaders read employment history"
on public.team_member_status_history for select to authenticated
using (
  public.current_portal_role() in ('manager','supervisor','admin')
  and public.can_access_store(store_id)
);

drop policy if exists "store leaders create employment history" on public.team_member_status_history;
create policy "store leaders create employment history"
on public.team_member_status_history for insert to authenticated
with check (
  changed_by = auth.uid()
  and public.current_portal_role() in ('manager','supervisor','admin')
  and public.can_access_store(store_id)
);

drop policy if exists "admins read HR notification settings" on public.hr_notification_settings;
create policy "admins read HR notification settings"
on public.hr_notification_settings for select to authenticated
using (public.current_portal_role() = 'admin');

drop policy if exists "admins update HR notification settings" on public.hr_notification_settings;
create policy "admins update HR notification settings"
on public.hr_notification_settings for update to authenticated
using (public.current_portal_role() = 'admin')
with check (public.current_portal_role() = 'admin');

drop policy if exists "clients cannot read HR delivery logs" on public.hr_termination_notifications;
create policy "clients cannot read HR delivery logs"
on public.hr_termination_notifications for select to authenticated
using (false);

comment on table public.team_member_status_history is
  'Permanent employment-status timeline used for roster history and DASH-recorded turnover.';
comment on table public.hr_notification_settings is
  'Admin-controlled HR delivery configuration. Test mode must be verified before live recipients are enabled.';
comment on table public.hr_termination_notifications is
  'Idempotent termination-email delivery log; accessible only to the service role.';
