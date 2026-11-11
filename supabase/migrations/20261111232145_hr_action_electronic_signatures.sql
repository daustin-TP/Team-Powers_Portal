alter table public.hr_disciplinary_actions
  add column if not exists amends_action_id uuid references public.hr_disciplinary_actions(id) on delete restrict;

create index if not exists hr_disciplinary_actions_amends_idx
  on public.hr_disciplinary_actions(amends_action_id)
  where amends_action_id is not null;

create table public.hr_disciplinary_action_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null unique references public.hr_disciplinary_actions(id) on delete restrict,
  record_version integer not null check (record_version > 0),
  record_snapshot jsonb not null,
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  outcome text not null check (outcome in ('acknowledged', 'refused')),
  employee_name text not null check (length(trim(employee_name)) between 2 and 160),
  employee_signature_data text,
  employee_statement text not null default '',
  employee_consented boolean not null default false,
  employee_signed_at timestamptz,
  manager_profile_id uuid not null references public.profiles(id) on delete restrict,
  manager_name text not null check (length(trim(manager_name)) between 2 and 160),
  manager_signature_data text not null,
  manager_signed_at timestamptz not null default now(),
  witness_name text,
  witness_signature_data text,
  witness_signed_at timestamptz,
  signer_ip inet,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  constraint hr_acknowledgment_signature_requirements check (
    (
      outcome = 'acknowledged'
      and employee_consented
      and employee_signed_at is not null
      and length(coalesce(employee_signature_data, '')) > 100
      and witness_name is null
      and witness_signature_data is null
      and witness_signed_at is null
    )
    or
    (
      outcome = 'refused'
      and not employee_consented
      and employee_signed_at is null
      and employee_signature_data is null
      and length(trim(coalesce(witness_name, ''))) >= 2
      and length(coalesce(witness_signature_data, '')) > 100
      and witness_signed_at is not null
    )
  ),
  constraint hr_manager_signature_present check (length(manager_signature_data) > 100)
);

create index hr_disciplinary_action_acknowledgments_manager_idx
  on public.hr_disciplinary_action_acknowledgments(manager_profile_id, created_at desc);

alter table public.hr_disciplinary_action_acknowledgments enable row level security;

create policy "authorized users read HR acknowledgment packets"
on public.hr_disciplinary_action_acknowledgments for select
to authenticated
using (
  exists (
    select 1
    from public.hr_disciplinary_actions action
    where action.id = action_id
      and (
        action.submitted_by = (select auth.uid())
        or (select public.current_portal_role()) in ('supervisor', 'admin')
      )
  )
);

revoke all on table public.hr_disciplinary_action_acknowledgments from anon, authenticated;
grant select on table public.hr_disciplinary_action_acknowledgments to authenticated;

create or replace function private.prevent_signed_hr_action_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if exists (
    select 1
    from public.hr_disciplinary_action_acknowledgments acknowledgment
    where acknowledgment.action_id = old.id
  ) then
    raise exception 'Signed HR records are immutable. Create a linked amendment instead.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_signed_hr_action_update() from public, anon, authenticated;

drop trigger if exists hr_disciplinary_action_signed_lock on public.hr_disciplinary_actions;
create trigger hr_disciplinary_action_signed_lock
before update on public.hr_disciplinary_actions
for each row execute function private.prevent_signed_hr_action_update();

comment on table public.hr_disciplinary_action_acknowledgments is
  'Immutable in-person employee acknowledgment or witnessed refusal packets, including the exact record snapshot and SHA-256 fingerprint.';
comment on column public.hr_disciplinary_action_acknowledgments.employee_signature_data is
  'Hand-drawn employee signature captured in person; employees do not require a DASH account or email address.';
comment on column public.hr_disciplinary_actions.amends_action_id is
  'Links a separately submitted correction to the immutable original record without rewriting it.';
