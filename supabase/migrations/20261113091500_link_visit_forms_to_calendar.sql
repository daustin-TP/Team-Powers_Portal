-- One DM visit form can be opened directly from its private calendar visit.

alter table public.supervisor_visit_logs
  add column if not exists schedule_id uuid references public.supervisor_visit_schedules(id) on delete set null;

create unique index if not exists supervisor_visit_logs_schedule_unique
  on public.supervisor_visit_logs(schedule_id)
  where schedule_id is not null;
