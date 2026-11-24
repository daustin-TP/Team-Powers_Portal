-- Custom supervisor activities can be scheduled without a store.
alter table public.supervisor_visit_schedules alter column store_id drop not null;
alter table public.supervisor_visit_schedules
  add constraint supervisor_visit_store_or_activity_check
  check (store_id is not null or (purpose = 'Other' and nullif(btrim(notes), '') is not null));

-- A private photo slot for each saved Training entry.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('supervisor-training-photos', 'supervisor-training-photos', false, 5242880,
        array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif'])
on conflict (id) do nothing;

create policy "leadership reads assigned training photos"
on storage.objects for select to authenticated
using (bucket_id = 'supervisor-training-photos'
  and (select public.current_portal_role()) in ('supervisor', 'admin')
  and exists (
    select 1 from public.supervisor_visit_schedules as visit
    where visit.id = case
      when name ~ '^[0-9a-f-]{36}/photo$'
        and split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(name, '/', 1)::uuid
    end
    and visit.purpose in ('Training', 'Training / coaching')
    and visit.status <> 'cancelled'
    and (visit.supervisor_id = (select auth.uid()) or (select public.current_portal_role()) = 'admin')
  ));

create policy "leadership adds assigned training photos"
on storage.objects for insert to authenticated
with check (bucket_id = 'supervisor-training-photos'
  and (select public.current_portal_role()) in ('supervisor', 'admin')
  and exists (
    select 1 from public.supervisor_visit_schedules as visit
    where visit.id = case
      when name ~ '^[0-9a-f-]{36}/photo$'
        and split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(name, '/', 1)::uuid
    end
    and visit.purpose in ('Training', 'Training / coaching')
    and visit.status <> 'cancelled'
    and (visit.supervisor_id = (select auth.uid()) or (select public.current_portal_role()) = 'admin')
  ));

create policy "leadership replaces assigned training photos"
on storage.objects for update to authenticated
using (bucket_id = 'supervisor-training-photos'
  and (select public.current_portal_role()) in ('supervisor', 'admin')
  and exists (
    select 1 from public.supervisor_visit_schedules as visit
    where visit.id = case
      when name ~ '^[0-9a-f-]{36}/photo$'
        and split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(name, '/', 1)::uuid
    end
    and visit.purpose in ('Training', 'Training / coaching')
    and visit.status <> 'cancelled'
    and (visit.supervisor_id = (select auth.uid()) or (select public.current_portal_role()) = 'admin')
  ))
with check (bucket_id = 'supervisor-training-photos'
  and (select public.current_portal_role()) in ('supervisor', 'admin')
  and exists (
    select 1 from public.supervisor_visit_schedules as visit
    where visit.id = case
      when name ~ '^[0-9a-f-]{36}/photo$'
        and split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(name, '/', 1)::uuid
    end
    and visit.purpose in ('Training', 'Training / coaching')
    and visit.status <> 'cancelled'
    and (visit.supervisor_id = (select auth.uid()) or (select public.current_portal_role()) = 'admin')
  ));
