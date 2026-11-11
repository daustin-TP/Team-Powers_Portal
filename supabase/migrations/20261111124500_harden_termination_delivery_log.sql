create index if not exists hr_notification_settings_updated_by_idx
  on public.hr_notification_settings(updated_by) where updated_by is not null;
create index if not exists hr_termination_notifications_member_idx
  on public.hr_termination_notifications(member_id);

drop policy if exists "clients cannot read HR delivery logs" on public.hr_termination_notifications;
create policy "clients cannot read HR delivery logs"
on public.hr_termination_notifications for select to authenticated
using (false);
