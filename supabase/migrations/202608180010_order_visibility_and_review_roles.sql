-- Employees and managers only see orders they personally submitted.
-- Supervisors, accounting, and administrators see the complete order queue.

drop policy if exists "users read permitted orders" on public.portal_orders;
create policy "users read permitted orders"
on public.portal_orders for select to authenticated
using (
  ordered_by = auth.uid()
  or public.current_portal_role() in ('supervisor', 'accounting', 'admin')
);

drop policy if exists "users read permitted order items" on public.portal_order_items;
create policy "users read permitted order items"
on public.portal_order_items for select to authenticated
using (
  exists (
    select 1 from public.portal_orders o
    where o.id = order_id
      and (
        o.ordered_by = auth.uid()
        or public.current_portal_role() in ('supervisor', 'accounting', 'admin')
      )
  )
);

drop policy if exists "reviewers update orders" on public.portal_orders;
create policy "reviewers update orders"
on public.portal_orders for update to authenticated
using (public.current_portal_role() in ('supervisor', 'accounting', 'admin'))
with check (public.current_portal_role() in ('supervisor', 'accounting', 'admin'));
