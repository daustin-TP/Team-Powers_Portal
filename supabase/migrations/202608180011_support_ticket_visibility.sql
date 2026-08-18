-- Employees and managers see only support tickets they submitted.
-- Supervisors, accounting, and administrators see all support tickets.

drop policy if exists "active users read tickets" on public.support_tickets;
drop policy if exists "users read permitted support tickets" on public.support_tickets;
create policy "users read permitted support tickets"
on public.support_tickets for select to authenticated
using (
  submitted_by = auth.uid()
  or public.current_portal_role() in ('supervisor', 'accounting', 'admin')
);

drop policy if exists "active users read ticket updates" on public.support_ticket_updates;
drop policy if exists "users read permitted ticket updates" on public.support_ticket_updates;
create policy "users read permitted ticket updates"
on public.support_ticket_updates for select to authenticated
using (
  exists (
    select 1 from public.support_tickets t
    where t.id = ticket_id
      and (
        t.submitted_by = auth.uid()
        or public.current_portal_role() in ('supervisor', 'accounting', 'admin')
      )
  )
);

drop policy if exists "active users read ticket images" on storage.objects;
drop policy if exists "users read permitted ticket images" on storage.objects;
create policy "users read permitted ticket images"
on storage.objects for select to authenticated
using (
  bucket_id = 'ticket-images'
  and (
    public.current_portal_role() in ('supervisor', 'accounting', 'admin')
    or exists (
      select 1 from public.support_tickets t
      where t.submitted_by = auth.uid()
        and (
          t.image_path = name
          or exists (
            select 1 from public.support_ticket_updates u
            where u.ticket_id = t.id and u.image_path = name
          )
        )
    )
  )
);
