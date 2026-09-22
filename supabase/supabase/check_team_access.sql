-- Read-only check for the two reported accounts. Run in Supabase SQL Editor.
-- Replace the DCB address below with its exact email if needed.
select
  u.email as auth_email,
  u.id as auth_user_id,
  p.id as portal_profile_id,
  p.email as portal_profile_email,
  p.active as portal_profile_active,
  p.role as portal_role,
  i.active as invitation_active,
  case
    when p.id is not null and p.active then 'Portal access active'
    when p.id is not null and not p.active then 'Portal profile disabled'
    when i.active then 'Authorized, but portal profile missing'
    else 'No active portal invitation or profile'
  end as portal_status
from auth.users u
left join public.profiles p on p.id = u.id
left join public.invited_employees i on lower(i.email) = lower(u.email)
where lower(u.email) = 'delaney.k.austin@gmail.com'
   or lower(u.email) like 'dcb%@powerspizza.com'
order by lower(u.email);
