create index if not exists supervisor_weekly_plans_created_by_idx
  on public.supervisor_weekly_plans(created_by);
create index if not exists supervisor_weekly_plans_updated_by_idx
  on public.supervisor_weekly_plans(updated_by);
create index if not exists supervisor_weekly_plan_history_supervisor_idx
  on public.supervisor_weekly_plan_history(supervisor_id, changed_at desc);
create index if not exists supervisor_weekly_plan_history_changed_by_idx
  on public.supervisor_weekly_plan_history(changed_by);
