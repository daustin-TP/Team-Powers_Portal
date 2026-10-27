create table if not exists public.support_ticket_notifications (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  event text not null check (event in ('submitted', 'completed')),
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  recipient_email text not null,
  status text not null check (status in ('sending', 'sent', 'failed')),
  provider_id text,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (ticket_id, event, recipient_profile_id)
);

alter table public.support_ticket_notifications enable row level security;

drop policy if exists "admins read support notification delivery" on public.support_ticket_notifications;
create policy "admins read support notification delivery"
on public.support_ticket_notifications for select to authenticated
using (public.current_portal_role() = 'admin');
