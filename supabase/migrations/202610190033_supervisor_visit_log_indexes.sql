-- Cover foreign keys used by administrator store filters and photo ownership checks.

create index if not exists supervisor_visit_logs_store_date_idx
  on public.supervisor_visit_logs(store_id, visit_date desc);

create index if not exists supervisor_visit_log_photos_uploader_idx
  on public.supervisor_visit_log_photos(uploaded_by);
