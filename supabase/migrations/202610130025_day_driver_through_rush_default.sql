-- Prefer extending an existing daytime driver through rush when doing so
-- preserves required coverage and reduces total scheduled driver hours.
alter table public.labor_store_settings
  alter column opening_driver_through_rush set default true;

-- Activate the new company scheduling rule for configured stores. Managers
-- can still opt out store-by-store from Labor Settings after this migration.
update public.labor_store_settings
set opening_driver_through_rush = true,
    updated_at = now()
where opening_driver_through_rush = false;
