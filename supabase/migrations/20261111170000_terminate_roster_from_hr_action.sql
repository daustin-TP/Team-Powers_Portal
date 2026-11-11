create or replace function private.terminate_roster_from_hr_action()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.action_type <> 'termination' or new.member_id is null then
    return new;
  end if;

  if new.termination_date is null
     or new.separation_classification is null
     or length(trim(coalesce(new.separation_description, ''))) < 10
     or length(trim(coalesce(new.manager_signature, ''))) = 0 then
    raise exception 'Complete the required termination paperwork before submitting';
  end if;

  update public.labor_team_members
  set employment_status = 'terminated',
      active = false,
      status_reason = coalesce(nullif(trim(new.separation_reason), ''), new.incident_summary),
      status_effective_date = new.termination_date,
      status_notes = 'Termination recorded automatically through HR Action Logs.',
      linked_hr_action_id = new.id,
      status_changed_by = new.submitted_by,
      status_changed_at = now(),
      updated_at = now()
  where id = new.member_id
    and store_id = new.store_id;

  if not found then
    raise exception 'The selected roster employee does not belong to this store';
  end if;

  return new;
end;
$$;

revoke all on function private.terminate_roster_from_hr_action() from public;

drop trigger if exists hr_action_terminates_roster on public.hr_disciplinary_actions;
create trigger hr_action_terminates_roster
after insert on public.hr_disciplinary_actions
for each row execute function private.terminate_roster_from_hr_action();

comment on function private.terminate_roster_from_hr_action() is
  'Atomically removes an employee from active scheduling when completed termination paperwork is saved.';
