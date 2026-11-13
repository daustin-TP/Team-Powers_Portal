alter table public.hr_notification_settings
  add column if not exists copy_assigned_supervisors boolean not null default true;

update public.hr_notification_settings
set copy_assigned_supervisors = true,
    updated_at = now()
where id = true and copy_assigned_supervisors is null;

comment on column public.hr_notification_settings.copy_assigned_supervisors is
  'When enabled, termination notices also copy every active Area Supervisor assigned to the employee store.';
