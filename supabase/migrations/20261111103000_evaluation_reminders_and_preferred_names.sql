alter table public.team_member_private_details
  add column if not exists preferred_name text not null default '';

comment on column public.team_member_private_details.preferred_name is
  'Optional preferred name used only for birthday and work-anniversary celebrations.';

create table if not exists public.team_evaluation_notifications (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  member_id uuid not null references public.labor_team_members(id) on delete cascade,
  evaluation_type text not null check (evaluation_type in ('90_day','annual','30_day_follow_up','other')),
  due_date date not null,
  event text not null check (event in ('available','past_due')),
  notification_date date not null,
  recipient_profile_id uuid references public.profiles(id) on delete set null,
  recipient_email text not null,
  status text not null default 'sending' check (status in ('sending','sent','failed')),
  provider_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, evaluation_type, due_date, event, notification_date, recipient_email)
);

create index if not exists team_evaluation_notifications_recipient_idx
  on public.team_evaluation_notifications(recipient_profile_id, notification_date desc);
create index if not exists team_evaluation_notifications_status_idx
  on public.team_evaluation_notifications(status, notification_date);

alter table public.team_evaluation_notifications enable row level security;
revoke all on public.team_evaluation_notifications from anon, authenticated;

comment on table public.team_evaluation_notifications is
  'Service-only idempotency and delivery ledger for automatic evaluation emails.';

-- November 1, 2026 is the live boundary requested for automated evaluations.
-- Preserve older records, but close unfinished historical drafts so they cannot
-- become overdue reminders after launch.
update public.team_evaluations
set status = 'completed',
    completed_at = coalesce(completed_at, timestamptz '2026-11-01 12:00:00-06'),
    manager_notes = case
      when position('DASH evaluation go-live' in coalesce(manager_notes, '')) > 0 then manager_notes
      when coalesce(manager_notes, '') = '' then 'Automatically closed at DASH evaluation go-live. Historical review due before November 2026.'
      else manager_notes || E'\n\nAutomatically closed at DASH evaluation go-live. Historical review due before November 2026.'
    end,
    updated_at = now()
where status = 'draft'
  and due_date < date '2026-11-01';
