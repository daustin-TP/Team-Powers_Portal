-- Give every current and future store a durable row for the complete set of
-- opening/closing labor controls used by the shared scheduling engine.
alter table public.labor_store_settings
  alter column manager_preopen_minutes set default 60,
  alter column driver_preopen_minutes set default 0,
  alter column manager_postclose_minutes set default 60,
  alter column driver_postclose_minutes set default 60;

insert into public.labor_store_settings (store_id)
select id from public.stores
on conflict (store_id) do nothing;

create or replace function public.create_labor_store_settings_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.labor_store_settings (store_id)
  values (new.id)
  on conflict (store_id) do nothing;
  return new;
end;
$$;

drop trigger if exists stores_create_labor_settings_defaults on public.stores;
create trigger stores_create_labor_settings_defaults
after insert on public.stores
for each row execute function public.create_labor_store_settings_defaults();
