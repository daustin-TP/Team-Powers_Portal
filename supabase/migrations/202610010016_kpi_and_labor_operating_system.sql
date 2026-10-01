-- Dash-OS KPI + Labor operating system.
-- Supabase becomes the permanent source of truth; Google Sheets may be used
-- temporarily as an import bridge but is not required by this schema.

alter table public.stores add column if not exists store_number text;
create unique index if not exists stores_store_number_unique
  on public.stores(store_number) where store_number is not null;
update public.stores set store_number='5491'
where store_number is null and lower(name) like '%smithville%';

create or replace function public.can_access_store(target_store uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_portal_role() = 'admin'
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.active = true and p.store_id = target_store
    )
    or exists (
      select 1 from public.profile_store_assignments a
      where a.profile_id = auth.uid() and a.store_id = target_store
    );
$$;

create table if not exists public.report_import_batches (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  report_family text not null check (report_family in ('kpi_weekly','labor_sales','labor_oven_items','labor_deliveries')),
  period_start date,
  period_end date not null,
  original_filename text not null,
  storage_path text,
  file_hash text,
  status text not null default 'uploaded' check (status in ('uploaded','processing','ready','needs_review','failed')),
  row_count integer not null default 0,
  warnings jsonb not null default '[]'::jsonb,
  error_message text,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (store_id, report_family, period_end, file_hash)
);

create table if not exists public.kpi_weekly_results (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  week_end date not null,
  metrics jsonb not null default '{}'::jsonb,
  source_batch_id uuid references public.report_import_batches(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id, week_end)
);

create table if not exists public.kpi_goal_commitments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  week_end date not null,
  goals jsonb not null default '{}'::jsonb,
  focus_area text not null default '',
  action_plan text not null default '',
  owner text not null default '',
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id, week_end)
);

create table if not exists public.labor_store_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  insider_items_per_15 numeric not null default 6,
  manager_items_per_15 numeric not null default 5,
  weekend_insider_items_per_15 numeric not null default 5,
  weekend_manager_items_per_15 numeric not null default 4,
  average_run_time_minutes integer not null default 15,
  manager_preopen_minutes integer not null default 60,
  manager_postclose_minutes integer not null default 60,
  driver_preopen_minutes integer not null default 0,
  driver_postclose_minutes integer not null default 60,
  manager_crossover_minutes integer not null default 60 check (manager_crossover_minutes between 15 and 120 and manager_crossover_minutes % 15 = 0),
  max_shift_hours numeric not null default 9,
  minimum_shift_hours numeric not null default 3,
  minor_break_after_hours numeric not null default 5.75,
  opening_driver_through_rush boolean not null default false,
  late_driver_rule text not null default 'until_close' check (late_driver_rule in ('hour_before_close','until_close','second_closer')),
  daylight_savings boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.labor_store_hours (
  store_id uuid not null references public.stores(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  open_time time not null,
  close_time time not null,
  primary key(store_id, day_of_week)
);

create table if not exists public.labor_team_members (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  display_name text not null,
  qualified_roles text[] not null default '{}',
  is_minor boolean not null default false,
  active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.labor_standard_availability (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  member_id uuid not null references public.labor_team_members(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null default '00:00',
  end_time time not null default '23:59',
  available boolean not null default true,
  unique(member_id, day_of_week, start_time, end_time)
);

create table if not exists public.labor_time_off (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  member_id uuid not null references public.labor_team_members(id) on delete cascade,
  week_start date not null,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null default '00:00',
  end_time time not null default '23:59',
  reason text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.labor_metric_intervals (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  business_date date not null,
  interval_start time not null,
  royalty_sales numeric not null default 0,
  oven_items integer not null default 0,
  delivery_orders integer not null default 0,
  daylight_savings boolean not null,
  source_batch_id uuid references public.report_import_batches(id),
  sales_source_batch_id uuid references public.report_import_batches(id),
  oven_source_batch_id uuid references public.report_import_batches(id),
  delivery_source_batch_id uuid references public.report_import_batches(id),
  unique(store_id, business_date, interval_start)
);
alter table public.labor_metric_intervals add column if not exists sales_source_batch_id uuid references public.report_import_batches(id);
alter table public.labor_metric_intervals add column if not exists oven_source_batch_id uuid references public.report_import_batches(id);
alter table public.labor_metric_intervals add column if not exists delivery_source_batch_id uuid references public.report_import_batches(id);

create table if not exists public.labor_week_plans (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  week_start date not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  forecast_method text not null default 'weighted_recent',
  created_by uuid references public.profiles(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(store_id, week_start)
);

create table if not exists public.labor_daily_projections (
  id uuid primary key default gen_random_uuid(),
  week_plan_id uuid not null references public.labor_week_plans(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  projected_sales numeric not null default 0,
  projected_oven_items integer not null default 0,
  projected_deliveries integer not null default 0,
  unique(week_plan_id, day_of_week)
);

create table if not exists public.labor_demand_intervals (
  id bigint generated always as identity primary key,
  week_plan_id uuid not null references public.labor_week_plans(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  interval_start time not null,
  projected_sales numeric not null default 0,
  projected_oven_items numeric not null default 0,
  projected_deliveries numeric not null default 0,
  required_managers integer not null default 1,
  required_insiders integer not null default 0,
  required_drivers integer not null default 1,
  unique(week_plan_id, day_of_week, interval_start)
);

create table if not exists public.labor_shifts (
  id uuid primary key default gen_random_uuid(),
  week_plan_id uuid not null references public.labor_week_plans(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  role text not null check (role in ('manager','insider','driver')),
  start_time time not null,
  end_time time not null,
  assigned_member_id uuid references public.labor_team_members(id) on delete set null,
  source text not null default 'suggested' check (source in ('suggested','manual')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.labor_schedule_publications (
  id uuid primary key default gen_random_uuid(),
  week_plan_id uuid not null references public.labor_week_plans(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  week_start date not null,
  revision integer not null default 1,
  snapshot jsonb not null,
  published_by uuid not null references public.profiles(id),
  published_at timestamptz not null default now(),
  unique(week_plan_id, revision)
);

create index if not exists kpi_results_week_idx on public.kpi_weekly_results(week_end, store_id);
create index if not exists labor_intervals_store_date_idx on public.labor_metric_intervals(store_id, business_date);
create index if not exists labor_plans_store_week_idx on public.labor_week_plans(store_id, week_start);
create index if not exists labor_shifts_plan_day_idx on public.labor_shifts(week_plan_id, day_of_week, role, start_time);
create index if not exists labor_time_off_week_idx on public.labor_time_off(store_id, week_start, day_of_week);

alter table public.report_import_batches enable row level security;
alter table public.kpi_weekly_results enable row level security;
alter table public.kpi_goal_commitments enable row level security;
alter table public.labor_store_settings enable row level security;
alter table public.labor_store_hours enable row level security;
alter table public.labor_team_members enable row level security;
alter table public.labor_standard_availability enable row level security;
alter table public.labor_time_off enable row level security;
alter table public.labor_metric_intervals enable row level security;
alter table public.labor_week_plans enable row level security;
alter table public.labor_daily_projections enable row level security;
alter table public.labor_demand_intervals enable row level security;
alter table public.labor_shifts enable row level security;
alter table public.labor_schedule_publications enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'report_import_batches','kpi_weekly_results','kpi_goal_commitments',
    'labor_store_settings','labor_store_hours','labor_team_members',
    'labor_standard_availability','labor_time_off','labor_metric_intervals',
    'labor_week_plans','labor_schedule_publications'
  ] loop
    execute format('drop policy if exists "store users read %1$s" on public.%1$I', table_name);
    execute format('create policy "store users read %1$s" on public.%1$I for select to authenticated using (public.can_access_store(store_id))', table_name);
    execute format('drop policy if exists "store leaders manage %1$s" on public.%1$I', table_name);
    execute format('create policy "store leaders manage %1$s" on public.%1$I for all to authenticated using (public.can_access_store(store_id) and public.current_portal_role() in (''manager'',''supervisor'',''admin'')) with check (public.can_access_store(store_id) and public.current_portal_role() in (''manager'',''supervisor'',''admin''))', table_name);
  end loop;
end $$;

drop policy if exists "store users read labor projections" on public.labor_daily_projections;
create policy "store users read labor projections" on public.labor_daily_projections for select to authenticated using (
  exists(select 1 from public.labor_week_plans p where p.id=week_plan_id and public.can_access_store(p.store_id))
);
drop policy if exists "store leaders manage labor projections" on public.labor_daily_projections;
create policy "store leaders manage labor projections" on public.labor_daily_projections for all to authenticated using (
  exists(select 1 from public.labor_week_plans p where p.id=week_plan_id and public.can_access_store(p.store_id)) and public.current_portal_role() in ('manager','supervisor','admin')
) with check (
  exists(select 1 from public.labor_week_plans p where p.id=week_plan_id and public.can_access_store(p.store_id)) and public.current_portal_role() in ('manager','supervisor','admin')
);

drop policy if exists "store users read labor demand" on public.labor_demand_intervals;
create policy "store users read labor demand" on public.labor_demand_intervals for select to authenticated using (
  exists(select 1 from public.labor_week_plans p where p.id=week_plan_id and public.can_access_store(p.store_id))
);
drop policy if exists "store leaders manage labor demand" on public.labor_demand_intervals;
create policy "store leaders manage labor demand" on public.labor_demand_intervals for all to authenticated using (
  exists(select 1 from public.labor_week_plans p where p.id=week_plan_id and public.can_access_store(p.store_id)) and public.current_portal_role() in ('manager','supervisor','admin')
) with check (
  exists(select 1 from public.labor_week_plans p where p.id=week_plan_id and public.can_access_store(p.store_id)) and public.current_portal_role() in ('manager','supervisor','admin')
);

drop policy if exists "store users read labor shifts" on public.labor_shifts;
create policy "store users read labor shifts" on public.labor_shifts for select to authenticated using (
  exists(select 1 from public.labor_week_plans p where p.id=week_plan_id and public.can_access_store(p.store_id))
);
drop policy if exists "store leaders manage labor shifts" on public.labor_shifts;
create policy "store leaders manage labor shifts" on public.labor_shifts for all to authenticated using (
  exists(select 1 from public.labor_week_plans p where p.id=week_plan_id and public.can_access_store(p.store_id)) and public.current_portal_role() in ('manager','supervisor','admin')
) with check (
  exists(select 1 from public.labor_week_plans p where p.id=week_plan_id and public.can_access_store(p.store_id)) and public.current_portal_role() in ('manager','supervisor','admin')
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('operating-reports','operating-reports',false,26214400,array[
  'application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel','text/csv'
]) on conflict(id) do nothing;

drop policy if exists "leaders upload operating reports" on storage.objects;
create policy "leaders upload operating reports" on storage.objects for insert to authenticated
with check(bucket_id='operating-reports' and public.current_portal_role() in ('manager','supervisor','admin'));
drop policy if exists "leaders read operating reports" on storage.objects;
create policy "leaders read operating reports" on storage.objects for select to authenticated
using(bucket_id='operating-reports' and public.current_portal_role() in ('manager','supervisor','admin'));

-- Realtime lets a supervisor watch the same schedule while a manager edits it.
do $$ begin alter publication supabase_realtime add table public.labor_shifts; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.labor_week_plans; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.kpi_goal_commitments; exception when duplicate_object then null; end $$;
