-- Manager-reviewed timed-order handling for isolated 15-minute oven-item spikes.

create table if not exists public.labor_interval_adjustments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  scope text not null check (scope in ('week','recurring')),
  week_start date,
  day_of_week integer not null check (day_of_week between 0 and 6),
  interval_start time not null,
  handling text not null check (handling in ('timed_order','keep_full')),
  prep_minutes integer not null default 90 check (prep_minutes between 15 and 240 and prep_minutes % 15 = 0),
  created_by uuid not null references public.profiles(id),
  created_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope = 'week' and week_start is not null) or (scope = 'recurring' and week_start is null))
);

create unique index if not exists labor_interval_adjustments_week_unique
  on public.labor_interval_adjustments(store_id, week_start, day_of_week, interval_start)
  where scope = 'week';
create unique index if not exists labor_interval_adjustments_recurring_unique
  on public.labor_interval_adjustments(store_id, day_of_week, interval_start)
  where scope = 'recurring';
create index if not exists labor_interval_adjustments_lookup_idx
  on public.labor_interval_adjustments(store_id, day_of_week, interval_start, week_start);

alter table public.labor_interval_adjustments enable row level security;
drop policy if exists "store users read interval adjustments" on public.labor_interval_adjustments;
create policy "store users read interval adjustments" on public.labor_interval_adjustments
  for select to authenticated using (public.can_access_store(store_id));
drop policy if exists "store leaders manage interval adjustments" on public.labor_interval_adjustments;
create policy "store leaders manage interval adjustments" on public.labor_interval_adjustments
  for all to authenticated
  using (public.can_access_store(store_id) and public.current_portal_role() in ('manager','supervisor','admin'))
  with check (public.can_access_store(store_id) and created_by = auth.uid() and public.current_portal_role() in ('manager','supervisor','admin'));

alter table public.demand_forecast_intervals
  add column if not exists oven_outlier_candidate boolean not null default false,
  add column if not exists oven_outlier_status text not null default 'none',
  add column if not exists oven_outlier_original numeric(10,2),
  add column if not exists oven_outlier_baseline numeric(10,2),
  add column if not exists oven_prep_minutes integer;

alter table public.labor_demand_intervals
  add column if not exists oven_outlier_candidate boolean not null default false,
  add column if not exists oven_outlier_status text not null default 'none',
  add column if not exists oven_outlier_original numeric,
  add column if not exists oven_outlier_baseline numeric,
  add column if not exists oven_prep_minutes integer;

do $$
begin
  alter table public.demand_forecast_intervals add constraint demand_forecast_intervals_outlier_status_check
    check (oven_outlier_status in ('none','unreviewed','timed_order_week','timed_order_recurring','keep_full'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.labor_demand_intervals add constraint labor_demand_intervals_outlier_status_check
    check (oven_outlier_status in ('none','unreviewed','timed_order_week','timed_order_recurring','keep_full'));
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.labor_interval_adjustments;
exception when duplicate_object then null;
end $$;
