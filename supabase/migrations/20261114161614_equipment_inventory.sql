do $$ begin
  create type public.maintenance_equipment_category as enum ('Oven','Walk-In','Makeline','Reach-In Cooler','Heat Rack','Other');
exception when duplicate_object then null;
end $$;

create table if not exists public.maintenance_equipment (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  category public.maintenance_equipment_category not null,
  label text not null check (char_length(trim(label)) between 1 and 120),
  make text not null default '' check (char_length(make) <= 160),
  model text not null default '' check (char_length(model) <= 160),
  serial_number text not null default '' check (char_length(serial_number) <= 200),
  image_path text check (image_path is null or char_length(image_path) <= 500),
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists maintenance_equipment_store_label_unique
  on public.maintenance_equipment(store_id, lower(trim(label)))
  where active;
create index if not exists maintenance_equipment_store_category_idx
  on public.maintenance_equipment(store_id, category, label)
  where active;

create table if not exists public.maintenance_equipment_service_logs (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.maintenance_equipment(id) on delete cascade,
  service_date date not null,
  work_performed text not null check (char_length(trim(work_performed)) between 3 and 5000),
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists maintenance_equipment_service_logs_timeline_idx
  on public.maintenance_equipment_service_logs(equipment_id, service_date desc, created_at desc);

create or replace function public.can_manage_maintenance_equipment(target_store uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (public.current_portal_role() in ('manager','supervisor','admin') and public.can_access_store(target_store))
    or exists (
      select 1
      from public.profile_capabilities capability
      where capability.profile_id = auth.uid()
        and capability.capability = 'maintenance'
    );
$$;

revoke all on function public.can_manage_maintenance_equipment(uuid) from public, anon;
grant execute on function public.can_manage_maintenance_equipment(uuid) to authenticated;

alter table public.maintenance_equipment enable row level security;
alter table public.maintenance_equipment_service_logs enable row level security;

drop policy if exists "store users read maintenance equipment" on public.maintenance_equipment;
create policy "store users read maintenance equipment"
on public.maintenance_equipment for select to authenticated
using (
  public.can_access_store(store_id)
  or public.can_manage_maintenance_equipment(store_id)
);

drop policy if exists "store leaders create maintenance equipment" on public.maintenance_equipment;
create policy "store leaders create maintenance equipment"
on public.maintenance_equipment for insert to authenticated
with check (
  created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and public.can_manage_maintenance_equipment(store_id)
);

drop policy if exists "store leaders update maintenance equipment" on public.maintenance_equipment;
create policy "store leaders update maintenance equipment"
on public.maintenance_equipment for update to authenticated
using (public.can_manage_maintenance_equipment(store_id))
with check (
  updated_by = (select auth.uid())
  and public.can_manage_maintenance_equipment(store_id)
);

drop policy if exists "store users read equipment service logs" on public.maintenance_equipment_service_logs;
create policy "store users read equipment service logs"
on public.maintenance_equipment_service_logs for select to authenticated
using (
  exists (
    select 1 from public.maintenance_equipment equipment
    where equipment.id = equipment_id
      and (public.can_access_store(equipment.store_id) or public.can_manage_maintenance_equipment(equipment.store_id))
  )
);

drop policy if exists "store leaders create equipment service logs" on public.maintenance_equipment_service_logs;
create policy "store leaders create equipment service logs"
on public.maintenance_equipment_service_logs for insert to authenticated
with check (
  recorded_by = (select auth.uid())
  and exists (
    select 1 from public.maintenance_equipment equipment
    where equipment.id = equipment_id
      and equipment.active
      and public.can_manage_maintenance_equipment(equipment.store_id)
  )
);

grant select, insert, update on public.maintenance_equipment to authenticated;
grant select, insert on public.maintenance_equipment_service_logs to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values('equipment-images','equipment-images',false,8388608,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "equipment users read equipment images" on storage.objects;
create policy "equipment users read equipment images"
on storage.objects for select to authenticated
using (
  bucket_id = 'equipment-images'
  and exists (
    select 1 from public.stores store
    where store.id::text = (storage.foldername(name))[1]
      and (public.can_access_store(store.id) or public.can_manage_maintenance_equipment(store.id))
  )
);

drop policy if exists "equipment users upload equipment images" on storage.objects;
create policy "equipment users upload equipment images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'equipment-images'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1 from public.stores store
    where store.id::text = (storage.foldername(name))[1]
      and public.can_manage_maintenance_equipment(store.id)
  )
);

drop policy if exists "equipment users remove their equipment images" on storage.objects;
create policy "equipment users remove their equipment images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'equipment-images'
  and (
    owner_id = (select auth.uid())::text
    or public.current_portal_role() = 'admin'
    or exists (
      select 1 from public.profile_capabilities capability
      where capability.profile_id = auth.uid()
        and capability.capability = 'maintenance'
    )
  )
);

comment on table public.maintenance_equipment is 'Store equipment registry with make, model, serial number, optional photo, and a customizable label.';
comment on table public.maintenance_equipment_service_logs is 'Permanent dated maintenance history for each registered piece of store equipment.';
