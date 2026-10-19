-- Restrict Data API privileges to the operations used by the visit workflow.

revoke all on public.supervisor_visit_logs from anon, authenticated;
revoke all on public.supervisor_visit_log_photos from anon, authenticated;

grant select, insert, update, delete on public.supervisor_visit_logs to authenticated;
grant select, insert, update, delete on public.supervisor_visit_log_photos to authenticated;
