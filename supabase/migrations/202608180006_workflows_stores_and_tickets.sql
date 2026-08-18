-- Safe to run again after a partial or completed attempt.
do $$ begin create type public.support_area as enum ('maintenance','technology'); exception when duplicate_object then null; end $$;
do $$ begin create type public.ticket_severity as enum ('green','yellow','red'); exception when duplicate_object then null; end $$;
do $$ begin create type public.ticket_status as enum ('submitted','viewed','in_progress','completed'); exception when duplicate_object then null; end $$;

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(), name text not null unique,
  active boolean not null default true, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles add column if not exists store_id uuid references public.stores(id);
alter table public.invited_employees add column if not exists store_id uuid references public.stores(id);

create table if not exists public.profile_capabilities (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  capability public.support_area not null, primary key(profile_id,capability)
);

alter table public.portal_orders add column if not exists employee_name text;
alter table public.portal_orders add column if not exists store_id uuid references public.stores(id);
alter table public.portal_orders add column if not exists payroll_acknowledged boolean not null default false;
alter table public.portal_orders add column if not exists decision text;
alter table public.portal_orders add column if not exists decision_notes text;
alter table public.portal_orders add column if not exists decided_by uuid references public.profiles(id);
alter table public.portal_orders add column if not exists decided_at timestamptz;
alter table public.portal_order_items add column if not exists approved_quantity integer;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(), area public.support_area not null,
  submitted_by uuid not null references public.profiles(id), store_id uuid not null references public.stores(id),
  severity public.ticket_severity not null, description text not null, steps_taken text not null default '',
  external_ticket_number text, image_path text, status public.ticket_status not null default 'submitted',
  acknowledged_by uuid references public.profiles(id), acknowledged_at timestamptz, completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.support_ticket_updates (
  id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid not null references public.profiles(id), status public.ticket_status,
  note text not null default '', image_path text, created_at timestamptz not null default now()
);

alter table public.stores enable row level security;
alter table public.profile_capabilities enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_ticket_updates enable row level security;

drop policy if exists "active users read stores" on public.stores;
create policy "active users read stores" on public.stores for select to authenticated using(public.current_portal_role() is not null);
drop policy if exists "admins manage stores" on public.stores;
create policy "admins manage stores" on public.stores for all to authenticated using(public.current_portal_role()='admin') with check(public.current_portal_role()='admin');
drop policy if exists "users read capabilities" on public.profile_capabilities;
create policy "users read capabilities" on public.profile_capabilities for select to authenticated using(public.current_portal_role() is not null);
drop policy if exists "admins manage capabilities" on public.profile_capabilities;
create policy "admins manage capabilities" on public.profile_capabilities for all to authenticated using(public.current_portal_role()='admin') with check(public.current_portal_role()='admin');
drop policy if exists "active users read tickets" on public.support_tickets;
create policy "active users read tickets" on public.support_tickets for select to authenticated using(public.current_portal_role() is not null);
drop policy if exists "active users create tickets" on public.support_tickets;
create policy "active users create tickets" on public.support_tickets for insert to authenticated with check(submitted_by=auth.uid() and public.current_portal_role() is not null);
drop policy if exists "responders update tickets" on public.support_tickets;
create policy "responders update tickets" on public.support_tickets for update to authenticated using(public.current_portal_role()='admin' or exists(select 1 from public.profile_capabilities c where c.profile_id=auth.uid() and c.capability=area));
drop policy if exists "active users read ticket updates" on public.support_ticket_updates;
create policy "active users read ticket updates" on public.support_ticket_updates for select to authenticated using(public.current_portal_role() is not null);
drop policy if exists "responders create ticket updates" on public.support_ticket_updates;
create policy "responders create ticket updates" on public.support_ticket_updates for insert to authenticated with check(author_id=auth.uid() and (public.current_portal_role()='admin' or exists(select 1 from public.support_tickets t join public.profile_capabilities c on c.profile_id=auth.uid() where t.id=ticket_id and c.capability=t.area)));

drop policy if exists "reviewers update orders" on public.portal_orders;
create policy "reviewers update orders" on public.portal_orders for update to authenticated using(public.current_portal_role() in('manager','accounting','admin')) with check(public.current_portal_role() in('manager','accounting','admin'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ticket-images','ticket-images',false,10485760,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict(id) do nothing;
drop policy if exists "active users upload ticket images" on storage.objects;
create policy "active users upload ticket images" on storage.objects for insert to authenticated with check(bucket_id='ticket-images' and (storage.foldername(name))[1]=auth.uid()::text and public.current_portal_role() is not null);
drop policy if exists "active users read ticket images" on storage.objects;
create policy "active users read ticket images" on storage.objects for select to authenticated using(bucket_id='ticket-images' and public.current_portal_role() is not null);

insert into public.stores(name) select distinct location from public.profiles where trim(location)<>'' on conflict(name) do nothing;
update public.profiles p set store_id=s.id from public.stores s where p.store_id is null and lower(trim(p.location))=lower(trim(s.name));

create or replace function public.activate_invited_profile() returns trigger language plpgsql security definer set search_path=public as $$
declare invite public.invited_employees%rowtype;
begin
  select * into invite from public.invited_employees where lower(email)=lower(new.email) and active=true;
  if invite.id is not null then
    insert into public.profiles(id,email,full_name,role,location,store_id,active)
    values(new.id,lower(new.email),invite.full_name,invite.role,invite.location,invite.store_id,true)
    on conflict(id) do update set full_name=excluded.full_name,role=excluded.role,location=excluded.location,store_id=excluded.store_id,active=true,updated_at=now();
  end if;
  return new;
end; $$;
