-- Rebuild invitation access so administrators can reliably create, read,
-- update, and deactivate pending team authorizations.

do $$
declare policy_record record;
begin
  for policy_record in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'invited_employees'
  loop
    execute format('drop policy if exists %I on public.invited_employees', policy_record.policyname);
  end loop;
end $$;

alter table public.invited_employees enable row level security;

create policy "administrators manage invitations"
on public.invited_employees for all to authenticated
using (public.current_portal_role() = 'admin')
with check (public.current_portal_role() = 'admin');
