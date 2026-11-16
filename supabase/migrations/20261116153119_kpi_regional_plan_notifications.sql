create table if not exists public.kpi_regional_plan_notifications (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.kpi_regional_plans(id) on delete cascade,
  event text not null check (event in ('released')),
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  recipient_email text not null,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  provider_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (plan_id, event, recipient_profile_id)
);

create index if not exists kpi_regional_plan_notifications_plan_id_idx
  on public.kpi_regional_plan_notifications(plan_id);
create index if not exists kpi_regional_plan_notifications_recipient_profile_id_idx
  on public.kpi_regional_plan_notifications(recipient_profile_id);

alter table public.kpi_regional_plan_notifications enable row level security;
revoke all on table public.kpi_regional_plan_notifications from anon, authenticated;
