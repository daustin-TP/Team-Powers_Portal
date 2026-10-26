-- Payroll support documents are private and can only be accessed through
-- short-lived signed URLs issued by the authenticated payroll Edge Function.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'payroll-attachments',
  'payroll-attachments',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

-- Do not grant direct object access. Upload and download are permitted only
-- with expiring signed tokens created after payroll role/store checks.
