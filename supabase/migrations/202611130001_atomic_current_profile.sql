create or replace function public.portal_current_profile()
returns table (
  id uuid,
  email text,
  full_name text,
  role public.portal_role,
  location text,
  active boolean,
  store_id uuid,
  permissions text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.email,
    p.full_name,
    p.role,
    p.location,
    p.active,
    p.store_id,
    coalesce(
      array_agg(distinct pp.permission) filter (where pp.permission is not null),
      array[]::text[]
    ) as permissions
  from public.profiles p
  left join public.profile_permissions pp on pp.profile_id = p.id
  where p.id = auth.uid() and p.active = true
  group by p.id, p.email, p.full_name, p.role, p.location, p.active, p.store_id;
$$;

revoke all on function public.portal_current_profile() from public, anon;
grant execute on function public.portal_current_profile() to authenticated, service_role;

comment on function public.portal_current_profile() is
  'Returns only the signed-in user active profile and portal permissions in one atomic lookup.';
