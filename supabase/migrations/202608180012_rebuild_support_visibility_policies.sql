-- Remove every live support-ticket SELECT policy, including policies that may
-- have been created manually, then rebuild the intended visibility rules.

do $$
declare policy_record record;
begin
  for policy_record in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'support_tickets' and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.support_tickets', policy_record.policyname);
  end loop;

  for policy_record in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'support_ticket_updates' and cmd = 'SELECT'
  loop
    execute format('drop policy if exists %I on public.support_ticket_updates', policy_record.policyname);
  end loop;

  for policy_record in
    select policyname from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd = 'SELECT'
      and coalesce(qual, '') ilike '%ticket-images%'
  loop
    execute format('drop policy if exists %I on storage.objects', policy_record.policyname);
  end loop;
end $$;

create policy "users read permitted support tickets"
on public.support_tickets for select to authenticated
using (
  submitted_by = auth.uid()
  or public.current_portal_role() in ('supervisor', 'accounting', 'admin')
);

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
