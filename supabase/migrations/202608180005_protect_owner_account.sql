-- Restore the portal owner immediately.
insert into public.invited_employees (email, full_name, role, location, active)
values ('daustin@powerspizza.com', 'Delaney Austin', 'admin', 'Operations', true)
on conflict (email) do update
set role = 'admin', active = true;

update public.profiles
set role = 'admin', active = true, updated_at = now()
where lower(email) = 'daustin@powerspizza.com';

-- Protect the owner at the database layer, not only in the interface.
create or replace function public.protect_portal_owner_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(old.email) = 'daustin@powerspizza.com'
     and (new.active is not true or new.role <> 'admin') then
    raise exception 'The portal owner account cannot be deactivated or demoted.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_portal_owner_profile_trigger on public.profiles;
create trigger protect_portal_owner_profile_trigger
before update on public.profiles
for each row execute function public.protect_portal_owner_profile();

create or replace function public.protect_portal_owner_invitation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(old.email) = 'daustin@powerspizza.com'
     and (new.active is not true or new.role <> 'admin') then
    raise exception 'The portal owner authorization cannot be deactivated or demoted.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_portal_owner_invitation_trigger on public.invited_employees;
create trigger protect_portal_owner_invitation_trigger
before update on public.invited_employees
for each row execute function public.protect_portal_owner_invitation();
