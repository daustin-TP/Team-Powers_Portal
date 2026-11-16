do $$ begin
  create type public.technology_equipment_type as enum (
    'Modem','Powers Router','Dominos Router','24 Port Meraki Switch','Turbo King Router',
    'Caller ID Box','Security Cameras','Back Office Computer','Front Counter Computer',
    'Makeline Computer','Dispatch Computer','Cut Table Tech Computer','Touchscreens',
    'TV''s','Computer Monitors (non-touchscreen)','Credit Card Machines (Customer Facing)',
    'Credit Card Machines (Manual Entry, wired)','Credit Card Machines (Manual Entry Wireless)',
    'Store Laptop','Office Printer','Receipt Printer (CTT)','Receipt Printer (Dispatch)','Other'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.technology_equipment (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id),
  equipment_type public.technology_equipment_type not null,
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

create unique index if not exists technology_equipment_store_label_unique
  on public.technology_equipment(store_id, lower(trim(label))) where active;
create index if not exists technology_equipment_store_type_idx
  on public.technology_equipment(store_id, equipment_type, label) where active;

create table if not exists public.technology_troubleshooting_guides (
  id uuid primary key default gen_random_uuid(),
  equipment_type public.technology_equipment_type not null,
  title text not null check (char_length(trim(title)) between 3 and 160),
  overview text not null default '' check (char_length(overview) <= 2000),
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 1 and 30),
  active boolean not null default true,
  created_by uuid not null references public.profiles(id),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists technology_troubleshooting_guide_title_unique
  on public.technology_troubleshooting_guides(equipment_type, lower(trim(title))) where active;
create index if not exists technology_troubleshooting_guide_type_idx
  on public.technology_troubleshooting_guides(equipment_type, title) where active;

alter table public.support_tickets
  add column if not exists technology_equipment_type public.technology_equipment_type,
  add column if not exists technology_equipment_id uuid references public.technology_equipment(id) on delete set null;

alter table public.support_tickets drop constraint if exists support_tickets_technology_equipment_area_check;
alter table public.support_tickets add constraint support_tickets_technology_equipment_area_check
  check (area = 'technology' or (technology_equipment_type is null and technology_equipment_id is null));

create index if not exists support_tickets_technology_equipment_idx
  on public.support_tickets(technology_equipment_id) where technology_equipment_id is not null;

create or replace function public.validate_support_ticket_technology_equipment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare selected_equipment public.technology_equipment%rowtype;
begin
  if new.technology_equipment_id is null then return new; end if;
  if new.area <> 'technology' then raise exception 'Registered technology equipment can only be attached to technology requests.'; end if;
  select * into selected_equipment from public.technology_equipment where id = new.technology_equipment_id and active;
  if selected_equipment.id is null then raise exception 'The selected technology equipment is unavailable.'; end if;
  if selected_equipment.store_id <> new.store_id then raise exception 'The selected technology equipment belongs to another store.'; end if;
  if new.technology_equipment_type is null then new.technology_equipment_type := selected_equipment.equipment_type; end if;
  if new.technology_equipment_type <> selected_equipment.equipment_type then raise exception 'The equipment type does not match the selected device.'; end if;
  return new;
end;
$$;

revoke all on function public.validate_support_ticket_technology_equipment() from public, anon;

drop trigger if exists validate_support_ticket_technology_equipment on public.support_tickets;
create trigger validate_support_ticket_technology_equipment
before insert or update of area, store_id, technology_equipment_type, technology_equipment_id
on public.support_tickets for each row execute function public.validate_support_ticket_technology_equipment();

create or replace function public.can_manage_technology_equipment(target_store uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (public.current_portal_role() in ('manager','supervisor','admin') and public.can_access_store(target_store))
    or exists (
      select 1 from public.profile_capabilities capability
      where capability.profile_id = auth.uid() and capability.capability = 'technology'
    );
$$;

revoke all on function public.can_manage_technology_equipment(uuid) from public, anon;
grant execute on function public.can_manage_technology_equipment(uuid) to authenticated;

create or replace function public.can_manage_troubleshooting_guides()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select public.current_portal_role() = 'admin'
    or exists (
      select 1 from public.profile_capabilities capability
      where capability.profile_id = auth.uid() and capability.capability = 'technology'
    );
$$;

revoke all on function public.can_manage_troubleshooting_guides() from public, anon;
grant execute on function public.can_manage_troubleshooting_guides() to authenticated;

alter table public.technology_equipment enable row level security;
alter table public.technology_troubleshooting_guides enable row level security;

create policy "store users read technology equipment"
on public.technology_equipment for select to authenticated
using (public.can_access_store(store_id) or public.can_manage_technology_equipment(store_id));

create policy "store leaders create technology equipment"
on public.technology_equipment for insert to authenticated
with check (
  created_by = (select auth.uid()) and updated_by = (select auth.uid())
  and public.can_manage_technology_equipment(store_id)
);

create policy "store leaders update technology equipment"
on public.technology_equipment for update to authenticated
using (public.can_manage_technology_equipment(store_id))
with check (updated_by = (select auth.uid()) and public.can_manage_technology_equipment(store_id));

create policy "active users read troubleshooting guides"
on public.technology_troubleshooting_guides for select to authenticated
using (public.current_portal_role() is not null);

create policy "technology responders create troubleshooting guides"
on public.technology_troubleshooting_guides for insert to authenticated
with check (
  created_by = (select auth.uid()) and updated_by = (select auth.uid())
  and public.can_manage_troubleshooting_guides()
);

create policy "technology responders update troubleshooting guides"
on public.technology_troubleshooting_guides for update to authenticated
using (public.can_manage_troubleshooting_guides())
with check (updated_by = (select auth.uid()) and public.can_manage_troubleshooting_guides());

grant select, insert, update on public.technology_equipment to authenticated;
grant select, insert, update on public.technology_troubleshooting_guides to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('technology-equipment-images','technology-equipment-images',false,8388608,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy "technology users read equipment images"
on storage.objects for select to authenticated
using (
  bucket_id = 'technology-equipment-images'
  and exists (
    select 1 from public.stores store
    where store.id::text = (storage.foldername(name))[1]
      and (public.can_access_store(store.id) or public.can_manage_technology_equipment(store.id))
  )
);

create policy "technology users upload equipment images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'technology-equipment-images'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1 from public.stores store
    where store.id::text = (storage.foldername(name))[1]
      and public.can_manage_technology_equipment(store.id)
  )
);

create policy "technology users remove equipment images"
on storage.objects for delete to authenticated
using (
  bucket_id = 'technology-equipment-images'
  and (
    owner_id = (select auth.uid())::text
    or public.current_portal_role() = 'admin'
    or exists (
      select 1 from public.profile_capabilities capability
      where capability.profile_id = auth.uid() and capability.capability = 'technology'
    )
  )
);

comment on table public.technology_equipment is 'Store technology inventory with device type, custom label, identifiers, and optional private photo.';
comment on table public.technology_troubleshooting_guides is 'Reusable step-by-step troubleshooting instructions organized by technology equipment type.';
