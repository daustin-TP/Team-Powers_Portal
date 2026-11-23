create table if not exists public.team_member_auth_deliveries (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.labor_team_members(id) on delete cascade,
  status text not null default 'sending' check (status in ('sending','sent','failed')),
  provider_id text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists team_member_auth_deliveries_member_created_idx
  on public.team_member_auth_deliveries(member_id, created_at desc);

alter table public.team_member_auth_deliveries enable row level security;
revoke all on public.team_member_auth_deliveries from public, anon, authenticated;
grant all on public.team_member_auth_deliveries to service_role;
