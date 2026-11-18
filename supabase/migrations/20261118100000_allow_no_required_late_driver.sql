alter table public.labor_store_settings
  drop constraint if exists labor_store_settings_late_driver_rule_check;

alter table public.labor_store_settings
  add constraint labor_store_settings_late_driver_rule_check
  check (late_driver_rule in ('none', 'hour_before_close', 'until_close', 'second_closer'));
