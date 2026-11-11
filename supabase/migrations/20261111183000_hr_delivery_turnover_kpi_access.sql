alter table public.team_member_status_history
  add column if not exists exclude_from_turnover boolean not null default false;

alter table public.hr_notification_settings
  add column if not exists live_to_recipients text[] not null default '{}',
  add column if not exists live_cc_recipients text[] not null default '{}';

alter table public.hr_termination_notifications
  add column if not exists cc_recipients text[] not null default '{}';

update public.hr_notification_settings
set delivery_mode = 'live',
    live_recipients = array['teampowershr@outlook.com']::text[],
    live_to_recipients = array['teampowershr@outlook.com']::text[],
    live_cc_recipients = array['daustin@powerspizza.com', 'btramont@powerspizza.com']::text[],
    updated_at = now()
where id = true;

insert into public.profile_permissions (profile_id, permission)
select id, 'kpi_view'
from public.profiles
where role = 'manager' and active = true
on conflict (profile_id, permission) do nothing;

create or replace function public.sync_default_kpi_permissions()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.active and new.role = 'supervisor' then
    insert into public.profile_permissions (profile_id, permission)
    values
      (new.id, 'kpi_view'),
      (new.id, 'kpi_edit_goals'),
      (new.id, 'kpi_view_all')
    on conflict (profile_id, permission) do nothing;
  elsif new.active and new.role = 'manager' then
    insert into public.profile_permissions (profile_id, permission)
    values (new.id, 'kpi_view')
    on conflict (profile_id, permission) do nothing;

    if tg_op = 'UPDATE' and old.role = 'supervisor' then
      delete from public.profile_permissions
      where profile_id = new.id
        and permission in ('kpi_edit_goals', 'kpi_view_all');
    end if;
  elsif tg_op = 'UPDATE' and old.role in ('supervisor', 'manager') and new.role not in ('supervisor', 'manager') then
    delete from public.profile_permissions
    where profile_id = new.id
      and permission in ('kpi_view', 'kpi_edit_goals', 'kpi_view_all');
  end if;
  return new;
end;
$$;

revoke all on function public.sync_default_kpi_permissions() from public, anon, authenticated;

drop trigger if exists sync_default_kpi_permissions_trigger on public.profiles;
create trigger sync_default_kpi_permissions_trigger
after insert or update of role, active on public.profiles
for each row execute function public.sync_default_kpi_permissions();

comment on column public.team_member_status_history.exclude_from_turnover is
  'Preserves audit history while excluding confirmed test or non-turnover events from KPI statistics.';
comment on column public.hr_termination_notifications.cc_recipients is
  'CC recipients included with the primary HR notification delivery.';
