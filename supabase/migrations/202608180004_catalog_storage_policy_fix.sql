-- Catalog image uploads may perform a lookup before inserting (particularly
-- when upsert is requested), so administrators need SELECT as well as write
-- permissions on this bucket.

drop policy if exists "admins read catalog image objects" on storage.objects;
create policy "admins read catalog image objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'catalog-images'
  and public.current_portal_role() = 'admin'
);

-- Recreate the write policies with explicit USING/WITH CHECK conditions so
-- both new rows and updated rows are validated consistently.
drop policy if exists "admins upload catalog images" on storage.objects;
create policy "admins upload catalog images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'catalog-images'
  and public.current_portal_role() = 'admin'
);

drop policy if exists "admins update catalog images" on storage.objects;
create policy "admins update catalog images"
on storage.objects for update to authenticated
using (
  bucket_id = 'catalog-images'
  and public.current_portal_role() = 'admin'
)
with check (
  bucket_id = 'catalog-images'
  and public.current_portal_role() = 'admin'
);

drop policy if exists "admins delete catalog images" on storage.objects;
create policy "admins delete catalog images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'catalog-images'
  and public.current_portal_role() = 'admin'
);

