-- Seasonal labor baselines and the shared scheduling-event calendar.

create table if not exists public.labor_baseline_sets (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  season text not null check (season in ('daylight','non_daylight')),
  period_start date not null,
  period_end date not null,
  weeks_count integer not null check (weeks_count > 0),
  status text not null default 'actual' check (status in ('actual','provisional')),
  source_label text,
  active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint labor_baseline_sets_period_check check (period_end >= period_start),
  unique (store_id, season, period_start, period_end)
);

create table if not exists public.labor_baseline_intervals (
  id uuid primary key default gen_random_uuid(),
  baseline_set_id uuid not null references public.labor_baseline_sets(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  interval_start time not null,
  raw_sales_total numeric(14,2) not null default 0,
  raw_oven_items_total numeric(14,2) not null default 0,
  raw_delivery_total numeric(14,2) not null default 0,
  avg_sales numeric(12,2) not null default 0,
  avg_oven_items numeric(12,2) not null default 0,
  avg_deliveries numeric(12,2) not null default 0,
  sales_source_batch_id uuid references public.report_import_batches(id),
  oven_source_batch_id uuid references public.report_import_batches(id),
  delivery_source_batch_id uuid references public.report_import_batches(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (baseline_set_id, day_of_week, interval_start)
);

create table if not exists public.labor_scheduling_events (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('company','store')),
  store_id uuid references public.stores(id) on delete cascade,
  name text not null,
  category text not null default 'custom' check (category in ('promotion','holiday','local_event','school','sports','weather','operations','custom')),
  start_date date not null,
  end_date date not null,
  all_day boolean not null default true,
  start_time time,
  end_time time,
  recurrence text not null default 'none' check (recurrence in ('none','annual')),
  status text not null default 'active' check (status in ('draft','active','cancelled')),
  impact_mode text not null default 'learning' check (impact_mode in ('learning','manual')),
  sales_lift_percent numeric(7,2),
  order_count_lift_percent numeric(7,2),
  oven_items_lift_percent numeric(7,2),
  delivery_lift_percent numeric(7,2),
  notes text,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint labor_scheduling_events_dates_check check (end_date >= start_date),
  constraint labor_scheduling_events_scope_store_check check (
    (scope = 'company' and store_id is null) or
    (scope = 'store' and store_id is not null)
  )
);

create index if not exists labor_baseline_sets_store_season_idx on public.labor_baseline_sets(store_id, season, active);
create index if not exists labor_baseline_intervals_lookup_idx on public.labor_baseline_intervals(store_id, day_of_week, interval_start);
create index if not exists labor_scheduling_events_dates_idx on public.labor_scheduling_events(start_date, end_date, status);
create index if not exists labor_scheduling_events_store_idx on public.labor_scheduling_events(store_id, start_date);

alter table public.labor_baseline_sets enable row level security;
alter table public.labor_baseline_intervals enable row level security;
alter table public.labor_scheduling_events enable row level security;

drop policy if exists "store users read labor baseline sets" on public.labor_baseline_sets;
create policy "store users read labor baseline sets" on public.labor_baseline_sets
  for select to authenticated using (public.can_access_store(store_id));
drop policy if exists "supervisors manage labor baseline sets" on public.labor_baseline_sets;
create policy "supervisors manage labor baseline sets" on public.labor_baseline_sets
  for all to authenticated
  using (public.current_portal_role() in ('supervisor','admin'))
  with check (public.current_portal_role() in ('supervisor','admin'));

drop policy if exists "store users read labor baseline intervals" on public.labor_baseline_intervals;
create policy "store users read labor baseline intervals" on public.labor_baseline_intervals
  for select to authenticated using (public.can_access_store(store_id));
drop policy if exists "supervisors manage labor baseline intervals" on public.labor_baseline_intervals;
create policy "supervisors manage labor baseline intervals" on public.labor_baseline_intervals
  for all to authenticated
  using (public.current_portal_role() in ('supervisor','admin'))
  with check (public.current_portal_role() in ('supervisor','admin'));

drop policy if exists "leaders read scheduling events" on public.labor_scheduling_events;
create policy "leaders read scheduling events" on public.labor_scheduling_events
  for select to authenticated using (
    public.current_portal_role() in ('manager','supervisor','admin') and
    (scope = 'company' or public.can_access_store(store_id))
  );
drop policy if exists "leaders create scheduling events" on public.labor_scheduling_events;
create policy "leaders create scheduling events" on public.labor_scheduling_events
  for insert to authenticated with check (
    (public.current_portal_role() in ('supervisor','admin')) or
    (public.current_portal_role() = 'manager' and scope = 'store' and public.can_access_store(store_id))
  );
drop policy if exists "leaders update scheduling events" on public.labor_scheduling_events;
create policy "leaders update scheduling events" on public.labor_scheduling_events
  for update to authenticated using (
    (public.current_portal_role() in ('supervisor','admin')) or
    (public.current_portal_role() = 'manager' and scope = 'store' and public.can_access_store(store_id))
  ) with check (
    (public.current_portal_role() in ('supervisor','admin')) or
    (public.current_portal_role() = 'manager' and scope = 'store' and public.can_access_store(store_id))
  );
drop policy if exists "leaders delete scheduling events" on public.labor_scheduling_events;
create policy "leaders delete scheduling events" on public.labor_scheduling_events
  for delete to authenticated using (
    (public.current_portal_role() in ('supervisor','admin')) or
    (public.current_portal_role() = 'manager' and scope = 'store' and public.can_access_store(store_id))
  );

grant select, insert, update, delete on public.labor_baseline_sets to authenticated;
grant select, insert, update, delete on public.labor_baseline_intervals to authenticated;
grant select, insert, update, delete on public.labor_scheduling_events to authenticated;

insert into public.labor_scheduling_events (
  scope, store_id, name, category, start_date, end_date, all_day,
  recurrence, status, impact_mode, notes
) values (
  'company', null, 'Boost Week · 50% off pizza', 'promotion',
  '2026-10-05', '2026-10-11', true, 'none', 'active', 'learning',
  'All pizzas are 50% off. Order and oven-item workload historically rises faster than royalty sales. Keep the four demand effects separate and review actual interval results after the event.'
)
on conflict do nothing;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'labor_scheduling_events'
  ) then
    alter publication supabase_realtime add table public.labor_scheduling_events;
  end if;
end $$;
