-- Run this before the first administrator signs in.
-- The migration's auth trigger will create the administrator profile
-- automatically when this email completes its first passwordless login.
insert into public.invited_employees (email, full_name, role, location, active)
values (
  'daustin@powerspizza.com',
  'Delaney Austin',
  'admin',
  'Operations',
  true
)
on conflict (email) do update
set role = 'admin', active = true;

insert into public.invited_employees (email, full_name, role, location)
values
  ('manager@powerspizza.com', 'Sample Manager', 'manager', 'Powers Pizza'),
  ('employee@powerspizza.com', 'Sample Employee', 'employee', 'Powers Pizza')
on conflict (email) do nothing;
