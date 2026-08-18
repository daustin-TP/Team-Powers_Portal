create type public.catalog_category as enum ('uniform', 'smallware');
create type public.purchase_responsibility as enum ('employee_deduction', 'store_purchase');

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  category public.catalog_category not null,
  name text not null,
  description text not null default '',
  price numeric(10,2) not null check (price >= 0),
  image_path text,
  sizes text[] not null default '{}',
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.portal_orders (
  id uuid primary key default gen_random_uuid(),
  ordered_by uuid not null references public.profiles(id),
  responsibility public.purchase_responsibility not null,
  employee_id uuid references public.profiles(id),
  store_name text,
  category public.catalog_category not null,
  notes text,
  total numeric(10,2) not null default 0,
  status public.request_status not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (responsibility = 'employee_deduction' and employee_id is not null)
    or (responsibility = 'store_purchase' and store_name is not null)
  )
);

create table public.portal_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.portal_orders(id) on delete cascade,
  catalog_item_id uuid references public.catalog_items(id),
  item_name text not null,
  unit_price numeric(10,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  size text,
  line_total numeric(10,2) generated always as (unit_price * quantity) stored
);

alter table public.catalog_items enable row level security;
alter table public.portal_orders enable row level security;
alter table public.portal_order_items enable row level security;

create policy "authenticated users read active catalog"
on public.catalog_items for select to authenticated
using (active = true or public.current_portal_role() = 'admin');

create policy "admins manage catalog"
on public.catalog_items for all to authenticated
using (public.current_portal_role() = 'admin')
with check (public.current_portal_role() = 'admin');

create policy "users create their own orders"
on public.portal_orders for insert to authenticated
with check (ordered_by = auth.uid() and public.current_portal_role() is not null);

create policy "users read permitted orders"
on public.portal_orders for select to authenticated
using (
  ordered_by = auth.uid()
  or employee_id = auth.uid()
  or public.current_portal_role() in ('manager', 'accounting', 'admin')
);

create policy "reviewers update orders"
on public.portal_orders for update to authenticated
using (public.current_portal_role() in ('manager', 'accounting', 'admin'));

create policy "users create items for their orders"
on public.portal_order_items for insert to authenticated
with check (
  exists (
    select 1 from public.portal_orders o
    where o.id = order_id and o.ordered_by = auth.uid()
  )
);

create policy "users read permitted order items"
on public.portal_order_items for select to authenticated
using (
  exists (
    select 1 from public.portal_orders o
    where o.id = order_id
      and (
        o.ordered_by = auth.uid()
        or o.employee_id = auth.uid()
        or public.current_portal_role() in ('manager', 'accounting', 'admin')
      )
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catalog-images',
  'catalog-images',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do nothing;

create policy "admins upload catalog images"
on storage.objects for insert to authenticated
with check (bucket_id = 'catalog-images' and public.current_portal_role() = 'admin');

create policy "admins update catalog images"
on storage.objects for update to authenticated
using (bucket_id = 'catalog-images' and public.current_portal_role() = 'admin');

create policy "admins delete catalog images"
on storage.objects for delete to authenticated
using (bucket_id = 'catalog-images' and public.current_portal_role() = 'admin');

-- Ensure the owner email remains authorized, then repair profiles for users
-- who signed in before their invitation was added.
insert into public.invited_employees (email, full_name, role, location, active)
values ('daustin@powerspizza.com', 'Delaney Austin', 'admin', 'Operations', true)
on conflict (email) do update
set role = 'admin', active = true;

insert into public.profiles (id, email, full_name, role, location, active)
select
  u.id,
  lower(u.email),
  i.full_name,
  i.role,
  i.location,
  true
from auth.users u
join public.invited_employees i on lower(i.email) = lower(u.email)
where i.active = true
on conflict (id) do update
set email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role,
    location = excluded.location,
    active = true,
    updated_at = now();

