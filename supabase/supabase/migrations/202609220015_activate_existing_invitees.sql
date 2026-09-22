-- An invitation added after someone first signs in must create their portal
-- profile too. The auth.users INSERT trigger only handles new Auth users.
-- Safe to run again. Existing profiles (including disabled ones) are left alone.

create or replace function public.activate_existing_invited_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  matching_user_id uuid;
begin
  if new.active is not true then
    return new;
  end if;

  select u.id into matching_user_id
  from auth.users u
  where lower(u.email) = lower(new.email)
  order by u.created_at desc
  limit 1;

  if matching_user_id is not null then
    insert into public.profiles
      (id, email, full_name, role, location, store_id, active)
    values
      (matching_user_id, lower(new.email), new.full_name, new.role,
       new.location, new.store_id, true)
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_invitation_authorized on public.invited_employees;
create trigger on_invitation_authorized
after insert or update of email, active on public.invited_employees
for each row execute function public.activate_existing_invited_auth_user();

-- Repair previously authorized Auth users without a portal profile. Never
-- reactivate a disabled profile or overwrite an existing role/store choice.
insert into public.profiles
  (id, email, full_name, role, location, store_id, active)
select
  u.id, lower(u.email), i.full_name, i.role, i.location, i.store_id, true
from auth.users u
join public.invited_employees i on lower(i.email) = lower(u.email)
where i.active = true
  and not exists (select 1 from public.profiles p where p.id = u.id)
  and not exists (select 1 from public.profiles p where lower(p.email) = lower(u.email))
on conflict (id) do nothing;
