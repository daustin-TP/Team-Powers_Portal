create extension if not exists "pgcrypto";

create type public.portal_role as enum ('employee', 'manager', 'accounting', 'admin');
create type public.request_status as enum ('draft', 'submitted', 'approved', 'returned', 'ordered', 'complete');
create type public.receipt_status as enum ('submitted', 'needs_review', 'matched', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role public.portal_role not null default 'employee',
  location text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invited_employees (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text not null,
  role public.portal_role not null default 'employee',
  location text not null default '',
  active boolean not null default true,
  invited_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.uniform_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id),
  location text not null,
  shirt_size text,
  items jsonb not null default '[]'::jsonb,
  estimated_total numeric(10,2) not null default 0,
  notes text,
  status public.request_status not null default 'submitted',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payroll_authorizations (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id),
  uniform_request_id uuid references public.uniform_requests(id),
  amount numeric(10,2) not null check (amount >= 0),
  signature_name text not null,
  authorized boolean not null default false,
  authorized_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.card_receipts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id),
  purchase_date date not null,
  vendor text not null,
  amount numeric(10,2) not null check (amount >= 0),
  category text not null,
  business_purpose text not null,
  storage_path text not null,
  status public.receipt_status not null default 'submitted',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.current_portal_role()
returns public.portal_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles
  where id = auth.uid() and active = true
$$;

create or replace function public.activate_invited_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare invite public.invited_employees%rowtype;
begin
  select * into invite
  from public.invited_employees
  where lower(email) = lower(new.email) and active = true;

  if invite.id is not null then
    insert into public.profiles (id, email, full_name, role, location, active)
    values (new.id, lower(new.email), invite.full_name, invite.role, invite.location, true)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.activate_invited_profile();

alter table public.profiles enable row level security;
alter table public.invited_employees enable row level security;
alter table public.uniform_requests enable row level security;
alter table public.payroll_authorizations enable row level security;
alter table public.card_receipts enable row level security;
alter table public.audit_events enable row level security;

create policy "users read own profile"
on public.profiles for select
using (id = auth.uid() and active = true);

create policy "admins manage profiles"
on public.profiles for all
using (public.current_portal_role() = 'admin')
with check (public.current_portal_role() = 'admin');

create policy "admins manage invitations"
on public.invited_employees for all
using (public.current_portal_role() = 'admin')
with check (public.current_portal_role() = 'admin');

create policy "employees read own uniform requests"
on public.uniform_requests for select
using (
  employee_id = auth.uid()
  or public.current_portal_role() in ('manager', 'accounting', 'admin')
);

create policy "employees create own uniform requests"
on public.uniform_requests for insert
with check (employee_id = auth.uid() and public.current_portal_role() is not null);

create policy "reviewers update uniform requests"
on public.uniform_requests for update
using (public.current_portal_role() in ('manager', 'admin'));

create policy "employees read own payroll authorizations"
on public.payroll_authorizations for select
using (
  employee_id = auth.uid()
  or public.current_portal_role() in ('accounting', 'admin')
);

create policy "employees create own payroll authorization"
on public.payroll_authorizations for insert
with check (employee_id = auth.uid() and authorized = true);

create policy "employees read own receipts"
on public.card_receipts for select
using (
  employee_id = auth.uid()
  or public.current_portal_role() in ('manager', 'accounting', 'admin')
);

create policy "employees create own receipts"
on public.card_receipts for insert
with check (employee_id = auth.uid() and public.current_portal_role() is not null);

create policy "accounting reviews receipts"
on public.card_receipts for update
using (public.current_portal_role() in ('accounting', 'admin'));

create policy "admins read audit history"
on public.audit_events for select
using (public.current_portal_role() = 'admin');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  10485760,
  array['image/jpeg','image/png','image/heic','image/webp','application/pdf']
)
on conflict (id) do nothing;

create policy "employees upload receipt files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.current_portal_role() is not null
);

create policy "employees read own receipt files"
on storage.objects for select to authenticated
using (
  bucket_id = 'receipts'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.current_portal_role() in ('accounting', 'admin')
  )
);
