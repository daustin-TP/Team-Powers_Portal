-- Allow the operating-report bucket to receive historical ZIP bundles.
update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed'
]
where id = 'operating-reports';
