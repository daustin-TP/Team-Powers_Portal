-- Cover every supervisor visit foreign key used for joins and referential checks.
create index if not exists supervisor_visit_schedules_store_date_idx
  on public.supervisor_visit_schedules(store_id, visit_date);
create index if not exists supervisor_visit_schedules_created_by_idx
  on public.supervisor_visit_schedules(created_by);
create index if not exists supervisor_visit_schedules_updated_by_idx
  on public.supervisor_visit_schedules(updated_by);
