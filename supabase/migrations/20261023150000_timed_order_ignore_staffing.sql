alter table public.labor_interval_adjustments
  drop constraint if exists labor_interval_adjustments_handling_check;

alter table public.labor_interval_adjustments
  add constraint labor_interval_adjustments_handling_check
  check (handling in ('timed_order', 'ignore_staffing', 'keep_full'));

alter table public.demand_forecast_intervals
  drop constraint if exists demand_forecast_intervals_outlier_status_check;

alter table public.demand_forecast_intervals
  add constraint demand_forecast_intervals_outlier_status_check
  check (oven_outlier_status in ('none', 'unreviewed', 'timed_order_week', 'timed_order_recurring', 'ignored_week', 'ignored_recurring', 'keep_full'));

alter table public.labor_demand_intervals
  drop constraint if exists labor_demand_intervals_outlier_status_check;

alter table public.labor_demand_intervals
  add constraint labor_demand_intervals_outlier_status_check
  check (oven_outlier_status in ('none', 'unreviewed', 'timed_order_week', 'timed_order_recurring', 'ignored_week', 'ignored_recurring', 'keep_full'));
