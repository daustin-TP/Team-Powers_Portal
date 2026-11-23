-- Cut tests are weekly per-store evidence, not scheduled Area Supervisor visits.
-- Multiple tests are intentionally allowed for the same store and week.

create table if not exists public.supervisor_cut_tests (
  id uuid primary key default gen_random_uuid(),
  supervisor_id uuid not null references public.profiles(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete restrict,
  week_start date not null,
  result text not null check (result in ('great', 'remake')),
  made_by text not null check (char_length(btrim(made_by)) between 1 and 160),
  image_path text not null check (char_length(btrim(image_path)) between 1 and 500),
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  constraint supervisor_cut_tests_monday_check check (extract(isodow from week_start) = 1)
);

create index if not exists supervisor_cut_tests_week_store_idx
  on public.supervisor_cut_tests(supervisor_id, week_start desc, store_id, created_at desc);
create index if not exists supervisor_cut_tests_store_idx on public.supervisor_cut_tests(store_id, created_at desc);
create index if not exists supervisor_cut_tests_created_by_idx on public.supervisor_cut_tests(created_by);

alter table public.supervisor_cut_tests enable row level security;
revoke all on public.supervisor_cut_tests from anon, authenticated;
grant select, insert on public.supervisor_cut_tests to authenticated;
grant all on public.supervisor_cut_tests to service_role;

drop policy if exists "leadership reads private cut tests" on public.supervisor_cut_tests;
create policy "leadership reads private cut tests"
on public.supervisor_cut_tests for select to authenticated
using (
  (select public.current_portal_role()) = 'admin'
  or ((select public.current_portal_role()) = 'supervisor' and supervisor_id = (select auth.uid()))
);

drop policy if exists "leadership records assigned-store cut tests" on public.supervisor_cut_tests;
create policy "leadership records assigned-store cut tests"
on public.supervisor_cut_tests for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (
    (select public.current_portal_role()) = 'admin'
    or (
      (select public.current_portal_role()) = 'supervisor'
      and supervisor_id = (select auth.uid())
      and public.can_access_store(store_id)
    )
  )
);

drop policy if exists "leaders remove their cut test uploads" on storage.objects;
create policy "leaders remove their cut test uploads"
on storage.objects for delete to authenticated
using (
  bucket_id = 'supervisor-visit-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[2] = 'cut-tests'
  and (select public.current_portal_role()) in ('supervisor', 'admin')
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'supervisor_cut_tests'
  ) then
    alter publication supabase_realtime add table public.supervisor_cut_tests;
  end if;
end $$;
