alter table public.hr_disciplinary_actions
  add column if not exists termination_hire_date date,
  add column if not exists last_date_worked date,
  add column if not exists termination_date date,
  add column if not exists employee_home_address text not null default '',
  add column if not exists employee_position text not null default '',
  add column if not exists separation_reason text not null default '',
  add column if not exists separation_classification text,
  add column if not exists separation_reasons text[] not null default '{}',
  add column if not exists separation_description text not null default '',
  add column if not exists manager_signature text not null default '',
  add column if not exists manager_signed_at timestamptz;

alter table public.hr_disciplinary_actions
  drop constraint if exists hr_disciplinary_actions_separation_classification_check;
alter table public.hr_disciplinary_actions
  add constraint hr_disciplinary_actions_separation_classification_check
  check (separation_classification is null or separation_classification in ('discharge','layoff','resignation','other'));

create or replace function private.capture_hr_manager_signature()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.action_type = 'termination'
     and length(trim(coalesce(new.manager_signature, ''))) > 0
     and (tg_op = 'INSERT' or new.manager_signature is distinct from old.manager_signature or old.manager_signed_at is null) then
    new.manager_signed_at := now();
  end if;
  return new;
end;
$$;

revoke all on function private.capture_hr_manager_signature() from public;

drop trigger if exists hr_manager_signature_capture on public.hr_disciplinary_actions;
create trigger hr_manager_signature_capture
before insert or update on public.hr_disciplinary_actions
for each row execute function private.capture_hr_manager_signature();

comment on column public.hr_disciplinary_actions.manager_signed_at is
  'Server-captured timestamp for the manager electronic signature on a termination report.';
comment on column public.hr_disciplinary_actions.separation_reasons is
  'Multiple legally relevant discharge or resignation reasons selected by the submitting manager.';
