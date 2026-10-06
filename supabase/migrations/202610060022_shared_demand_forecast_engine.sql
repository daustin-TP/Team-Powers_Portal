-- Shared, versioned demand forecasts consumed by KPI and Labor.

create table if not exists public.demand_forecast_runs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  week_start date not null,
  week_end date not null,
  season text not null check (season in ('daylight','non_daylight')),
  method_version text not null default 'demand-v1',
  status text not null default 'ready' check (status in ('processing','ready','failed','superseded')),
  is_current boolean not null default true,
  confidence_score numeric(5,2) not null default 0 check (confidence_score between 0 and 100),
  confidence_level text not null default 'low' check (confidence_level in ('low','moderate','high')),
  confidence_reasons jsonb not null default '[]'::jsonb,
  input_summary jsonb not null default '{}'::jsonb,
  event_adjustments jsonb not null default '[]'::jsonb,
  weekly_projection jsonb not null default '{}'::jsonb,
  manual_weekly_sales numeric(14,2),
  generated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint demand_forecast_week_check check (week_end = week_start + 6)
);

create unique index if not exists demand_forecast_current_week_idx
  on public.demand_forecast_runs(store_id, week_start)
  where is_current;
create index if not exists demand_forecast_store_history_idx
  on public.demand_forecast_runs(store_id, week_start desc, created_at desc);

create table if not exists public.demand_forecast_daily (
  id uuid primary key default gen_random_uuid(),
  forecast_run_id uuid not null references public.demand_forecast_runs(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  business_date date not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  projected_sales numeric(14,2) not null default 0,
  projected_orders numeric(12,2) not null default 0,
  projected_oven_items numeric(12,2) not null default 0,
  projected_deliveries numeric(12,2) not null default 0,
  low_sales numeric(14,2) not null default 0,
  high_sales numeric(14,2) not null default 0,
  applied_adjustments jsonb not null default '[]'::jsonb,
  unique(forecast_run_id, day_of_week)
);

create table if not exists public.demand_forecast_intervals (
  id bigint generated always as identity primary key,
  forecast_run_id uuid not null references public.demand_forecast_runs(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  business_date date not null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  interval_start time not null,
  projected_sales numeric(12,2) not null default 0,
  projected_orders numeric(10,2) not null default 0,
  projected_oven_items numeric(10,2) not null default 0,
  projected_deliveries numeric(10,2) not null default 0,
  required_managers integer not null default 0,
  required_insiders integer not null default 0,
  required_drivers integer not null default 0,
  unique(forecast_run_id, day_of_week, interval_start)
);

create index if not exists demand_forecast_daily_lookup_idx
  on public.demand_forecast_daily(store_id, business_date);
create index if not exists demand_forecast_interval_lookup_idx
  on public.demand_forecast_intervals(store_id, business_date, interval_start);

alter table public.labor_week_plans
  add column if not exists forecast_run_id uuid references public.demand_forecast_runs(id) on delete set null;

alter table public.demand_forecast_runs enable row level security;
alter table public.demand_forecast_daily enable row level security;
alter table public.demand_forecast_intervals enable row level security;

drop policy if exists "store users read demand forecast runs" on public.demand_forecast_runs;
create policy "store users read demand forecast runs" on public.demand_forecast_runs
  for select to authenticated using (public.can_access_store(store_id));
drop policy if exists "leaders manage demand forecast runs" on public.demand_forecast_runs;
create policy "leaders manage demand forecast runs" on public.demand_forecast_runs
  for all to authenticated
  using (public.can_access_store(store_id) and public.current_portal_role() in ('manager','supervisor','admin'))
  with check (public.can_access_store(store_id) and public.current_portal_role() in ('manager','supervisor','admin'));

drop policy if exists "store users read daily demand forecasts" on public.demand_forecast_daily;
create policy "store users read daily demand forecasts" on public.demand_forecast_daily
  for select to authenticated using (public.can_access_store(store_id));
drop policy if exists "leaders manage daily demand forecasts" on public.demand_forecast_daily;
create policy "leaders manage daily demand forecasts" on public.demand_forecast_daily
  for all to authenticated
  using (public.can_access_store(store_id) and public.current_portal_role() in ('manager','supervisor','admin'))
  with check (public.can_access_store(store_id) and public.current_portal_role() in ('manager','supervisor','admin'));

drop policy if exists "store users read interval demand forecasts" on public.demand_forecast_intervals;
create policy "store users read interval demand forecasts" on public.demand_forecast_intervals
  for select to authenticated using (public.can_access_store(store_id));
drop policy if exists "leaders manage interval demand forecasts" on public.demand_forecast_intervals;
create policy "leaders manage interval demand forecasts" on public.demand_forecast_intervals
  for all to authenticated
  using (public.can_access_store(store_id) and public.current_portal_role() in ('manager','supervisor','admin'))
  with check (public.can_access_store(store_id) and public.current_portal_role() in ('manager','supervisor','admin'));

grant select, insert, update, delete on public.demand_forecast_runs to authenticated;
grant select, insert, update, delete on public.demand_forecast_daily to authenticated;
grant select, insert, update, delete on public.demand_forecast_intervals to authenticated;
grant usage, select on sequence public.demand_forecast_intervals_id_seq to authenticated;

