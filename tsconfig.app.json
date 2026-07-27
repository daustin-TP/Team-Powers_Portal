-- Managers and accounting users need employee names for operational queues.
-- Personal profile edits remain restricted to administrators.
create policy "operations read active profiles"
on public.profiles for select
using (
  active = true
  and public.current_portal_role() in ('manager', 'accounting', 'admin')
);

-- Administrators can see inactive accounts so access can be restored.
create policy "admins read all profiles"
on public.profiles for select
using (public.current_portal_role() = 'admin');
