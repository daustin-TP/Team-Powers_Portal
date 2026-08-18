-- Administrators and accounting may permanently remove submitted requests.
-- Related order items and ticket updates are removed by their cascade keys.

drop policy if exists "admins and accounting delete orders" on public.portal_orders;
create policy "admins and accounting delete orders"
on public.portal_orders for delete to authenticated
using (public.current_portal_role() in ('admin', 'accounting'));

drop policy if exists "admins and accounting delete receipts" on public.card_receipts;
create policy "admins and accounting delete receipts"
on public.card_receipts for delete to authenticated
using (public.current_portal_role() in ('admin', 'accounting'));

drop policy if exists "admins and accounting delete support tickets" on public.support_tickets;
create policy "admins and accounting delete support tickets"
on public.support_tickets for delete to authenticated
using (public.current_portal_role() in ('admin', 'accounting'));

drop policy if exists "admins and accounting delete receipt files" on storage.objects;
create policy "admins and accounting delete receipt files"
on storage.objects for delete to authenticated
using (bucket_id = 'receipts' and public.current_portal_role() in ('admin', 'accounting'));

drop policy if exists "admins and accounting delete ticket images" on storage.objects;
create policy "admins and accounting delete ticket images"
on storage.objects for delete to authenticated
using (bucket_id = 'ticket-images' and public.current_portal_role() in ('admin', 'accounting'));
