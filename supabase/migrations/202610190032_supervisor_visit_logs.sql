-- Mobile-first District Manager visit logs with private photo evidence.

create table if not exists public.supervisor_visit_logs (
  id uuid primary key default gen_random_uuid(),
  supervisor_id uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  supervisor_name text not null check (length(btrim(supervisor_name)) between 1 and 160),
  store_id uuid not null references public.stores(id) on delete restrict,
  visit_date date not null default current_date,
  visit_time time,
  manager_name text,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  form_data jsonb not null default '{}'::jsonb check (jsonb_typeof(form_data) = 'object'),
  completion_percent integer not null default 0 check (completion_percent between 0 and 100),
  sections_touched integer not null default 0 check (sections_touched >= 0),
  issues_found integer not null default 0 check (issues_found >= 0),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supervisor_visit_submission_check check (
    (status = 'draft' and submitted_at is null)
    or (status = 'submitted' and submitted_at is not null)
  )
);

create table if not exists public.supervisor_visit_log_photos (
  id uuid primary key default gen_random_uuid(),
  visit_log_id uuid not null references public.supervisor_visit_logs(id) on delete restrict,
  uploaded_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  section_key text not null check (length(btrim(section_key)) between 1 and 80),
  storage_path text not null unique,
  original_name text not null,
  caption text,
  created_at timestamptz not null default now()
);

create index if not exists supervisor_visit_logs_date_idx
  on public.supervisor_visit_logs(visit_date desc, created_at desc);
create index if not exists supervisor_visit_logs_owner_date_idx
  on public.supervisor_visit_logs(supervisor_id, visit_date desc);
create index if not exists supervisor_visit_log_photos_log_idx
  on public.supervisor_visit_log_photos(visit_log_id, created_at);

alter table public.supervisor_visit_logs enable row level security;
alter table public.supervisor_visit_log_photos enable row level security;

drop policy if exists "supervisors read their visit logs" on public.supervisor_visit_logs;
create policy "supervisors read their visit logs"
on public.supervisor_visit_logs for select to authenticated
using (
  (select public.current_portal_role()) = 'admin'
  or (
    (select public.current_portal_role()) = 'supervisor'
    and supervisor_id = (select auth.uid())
  )
);

drop policy if exists "supervisors create their visit logs" on public.supervisor_visit_logs;
create policy "supervisors create their visit logs"
on public.supervisor_visit_logs for insert to authenticated
with check (
  supervisor_id = (select auth.uid())
  and (select public.current_portal_role()) in ('supervisor', 'admin')
);

drop policy if exists "supervisors update draft visit logs" on public.supervisor_visit_logs;
create policy "supervisors update draft visit logs"
on public.supervisor_visit_logs for update to authenticated
using (
  (select public.current_portal_role()) = 'admin'
  or (
    (select public.current_portal_role()) = 'supervisor'
    and supervisor_id = (select auth.uid())
    and status = 'draft'
  )
)
with check (
  (select public.current_portal_role()) = 'admin'
  or (
    (select public.current_portal_role()) = 'supervisor'
    and supervisor_id = (select auth.uid())
  )
);

drop policy if exists "leaders delete draft visit logs" on public.supervisor_visit_logs;
create policy "leaders delete draft visit logs"
on public.supervisor_visit_logs for delete to authenticated
using (
  status = 'draft'
  and (
    (select public.current_portal_role()) = 'admin'
    or (
      (select public.current_portal_role()) = 'supervisor'
      and supervisor_id = (select auth.uid())
    )
  )
);

drop policy if exists "leaders read permitted visit photos" on public.supervisor_visit_log_photos;
create policy "leaders read permitted visit photos"
on public.supervisor_visit_log_photos for select to authenticated
using (
  exists (
    select 1 from public.supervisor_visit_logs log
    where log.id = visit_log_id
      and (
        (select public.current_portal_role()) = 'admin'
        or (
          (select public.current_portal_role()) = 'supervisor'
          and log.supervisor_id = (select auth.uid())
        )
      )
  )
);

drop policy if exists "leaders add photos to draft visit logs" on public.supervisor_visit_log_photos;
create policy "leaders add photos to draft visit logs"
on public.supervisor_visit_log_photos for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and exists (
    select 1 from public.supervisor_visit_logs log
    where log.id = visit_log_id
      and log.status = 'draft'
      and (
        (select public.current_portal_role()) = 'admin'
        or (
          (select public.current_portal_role()) = 'supervisor'
          and log.supervisor_id = (select auth.uid())
        )
      )
  )
);

drop policy if exists "leaders update photos on draft visit logs" on public.supervisor_visit_log_photos;
create policy "leaders update photos on draft visit logs"
on public.supervisor_visit_log_photos for update to authenticated
using (
  exists (
    select 1 from public.supervisor_visit_logs log
    where log.id = visit_log_id
      and log.status = 'draft'
      and (
        (select public.current_portal_role()) = 'admin'
        or (
          (select public.current_portal_role()) = 'supervisor'
          and log.supervisor_id = (select auth.uid())
        )
      )
  )
)
with check (uploaded_by = (select auth.uid()));

drop policy if exists "leaders delete photos from draft visit logs" on public.supervisor_visit_log_photos;
create policy "leaders delete photos from draft visit logs"
on public.supervisor_visit_log_photos for delete to authenticated
using (
  exists (
    select 1 from public.supervisor_visit_logs log
    where log.id = visit_log_id
      and log.status = 'draft'
      and (
        (select public.current_portal_role()) = 'admin'
        or (
          (select public.current_portal_role()) = 'supervisor'
          and log.supervisor_id = (select auth.uid())
        )
      )
  )
);

revoke all on public.supervisor_visit_logs from anon;
revoke all on public.supervisor_visit_log_photos from anon;
grant select, insert, update, delete on public.supervisor_visit_logs to authenticated;
grant select, insert, update, delete on public.supervisor_visit_log_photos to authenticated;
grant all on public.supervisor_visit_logs to service_role;
grant all on public.supervisor_visit_log_photos to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'supervisor-visit-photos',
  'supervisor-visit-photos',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "leaders upload their visit photos" on storage.objects;
create policy "leaders upload their visit photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'supervisor-visit-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (select public.current_portal_role()) in ('supervisor', 'admin')
);

drop policy if exists "leaders read permitted visit photo objects" on storage.objects;
create policy "leaders read permitted visit photo objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'supervisor-visit-photos'
  and (
    (select public.current_portal_role()) = 'admin'
    or (
      (select public.current_portal_role()) = 'supervisor'
      and (storage.foldername(name))[1] = (select auth.uid())::text
    )
  )
);

drop policy if exists "leaders delete draft visit photo objects" on storage.objects;
create policy "leaders delete draft visit photo objects"
on storage.objects for delete to authenticated
using (
  bucket_id = 'supervisor-visit-photos'
  and exists (
    select 1
    from public.supervisor_visit_log_photos photo
    join public.supervisor_visit_logs log on log.id = photo.visit_log_id
    where photo.storage_path = name
      and log.status = 'draft'
      and (
        (select public.current_portal_role()) = 'admin'
        or (
          (select public.current_portal_role()) = 'supervisor'
          and log.supervisor_id = (select auth.uid())
        )
      )
  )
);
