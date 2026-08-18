create table if not exists public.receipt_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.receipt_categories enable row level security;
drop policy if exists "active users read receipt categories" on public.receipt_categories;
create policy "active users read receipt categories" on public.receipt_categories for select to authenticated
using (active=true or public.current_portal_role()='admin');
drop policy if exists "admins manage receipt categories" on public.receipt_categories;
create policy "admins manage receipt categories" on public.receipt_categories for all to authenticated
using (public.current_portal_role()='admin') with check (public.current_portal_role()='admin');
insert into public.receipt_categories(name) values
('Food and supplies'),('Repairs and maintenance'),('Office'),('Travel'),('Other')
on conflict(name) do nothing;
