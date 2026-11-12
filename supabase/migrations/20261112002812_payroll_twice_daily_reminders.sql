create or replace function public.payroll_queue_reminders(at_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  local_time timestamp := at_time at time zone 'America/Chicago';
  d date := local_time::date;
  reminder_slot text;
  n integer;
begin
  if extract(isodow from d) <> 1 or (d - date '2026-10-19') % 14 <> 0 then
    return 0;
  end if;

  if local_time::time >= time '09:00' and local_time::time < time '14:00' then
    reminder_slot := 'morning';
  elsif local_time::time >= time '14:00' and local_time::time < time '16:00' then
    reminder_slot := 'afternoon';
  else
    return 0;
  end if;

  insert into public.payroll_email_outbox(dedupe_key, kind, due_date, recipient, payload)
  select
    'reminder:' || reminder_slot || ':' || d || ':' || p.id,
    'reminder',
    d,
    p.email,
    jsonb_build_object(
      'profile_id', p.id,
      'name', p.full_name,
      'store_names', string_agg(s.name, ', ' order by s.name),
      'reminder_slot', reminder_slot
    )
  from public.profiles p
  join public.stores s
    on s.id = p.store_id
    or exists (
      select 1
      from public.profile_store_assignments a
      where a.profile_id = p.id and a.store_id = s.id
    )
  where p.active
    and p.role::text = 'manager'
    and coalesce(p.email, '') <> ''
    and s.active
    and lower(regexp_replace(s.name, '\s', '', 'g')) <> 'allstores'
    and not exists (
      select 1
      from public.payroll_submissions x
      where x.due_date = d
        and x.store_id = s.id
        and x.status in ('submitted', 'approved')
    )
    and not exists (
      select 1
      from public.payroll_cycles c
      where c.due_date = d and c.status = 'approved'
    )
  group by p.id, p.email, p.full_name
  on conflict (dedupe_key) do nothing;

  get diagnostics n = row_count;
  return n;
end
$$;

revoke all on function public.payroll_queue_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.payroll_queue_reminders(timestamptz) to service_role;
