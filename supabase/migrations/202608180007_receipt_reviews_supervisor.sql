-- Add Supervisor as a primary role. Safe to run repeatedly.
alter type public.portal_role add value if not exists 'supervisor' after 'employee';

alter table public.card_receipts add column if not exists acknowledged_by uuid references public.profiles(id);
alter table public.card_receipts add column if not exists acknowledged_at timestamptz;
alter table public.card_receipts add column if not exists review_notes text;

drop policy if exists "accounting reviews receipts" on public.card_receipts;
create policy "accounting reviews receipts"
on public.card_receipts for update to authenticated
using (public.current_portal_role()::text in ('accounting','admin'))
with check (public.current_portal_role()::text in ('accounting','admin'));

drop policy if exists "supervisors read active profiles" on public.profiles;
create policy "supervisors read active profiles"
on public.profiles for select to authenticated
using (active=true and public.current_portal_role()::text='supervisor');

drop policy if exists "reviewers update orders" on public.portal_orders;
create policy "reviewers update orders"
on public.portal_orders for update to authenticated
using (public.current_portal_role()::text in ('supervisor','manager','accounting','admin'))
with check (public.current_portal_role()::text in ('supervisor','manager','accounting','admin'));
