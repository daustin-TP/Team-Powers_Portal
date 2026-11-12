-- Integration assertions; all test writes are rolled back.
begin;
do $$
declare a uuid; m uuid; c jsonb; s uuid; d date := date '2026-10-19'+28000; rejected boolean; leave_id uuid;
begin
  select id into a from public.profiles where role::text='admin' and active limit 1;
  select id into m from public.profiles where role::text='manager' and active limit 1;
  if a is null then raise exception 'Test requires an active admin'; end if;
  rejected:=false;
  begin perform public.payroll_action(gen_random_uuid(),'ensure',jsonb_build_object('due_date',d)); exception when others then rejected:=true; end;
  if not rejected then raise exception 'Unknown actor gained payroll access'; end if;
  c:=public.payroll_action(a,'ensure',jsonb_build_object('due_date',d));
  rejected:=false;
  begin perform public.payroll_action(a,'approve_cycle',jsonb_build_object('due_date',d)); exception when others then rejected:=true; end;
  if not rejected then raise exception 'Incomplete cycle approved'; end if;
  foreach s in array(select store_ids from public.payroll_cycles where due_date=d) loop
    rejected:=false;
    begin perform public.payroll_action(a,'save',jsonb_build_object('due_date',d,'store_id',s,'status','submitted','entries','[]'::jsonb,'confirmed_sections','[]'::jsonb)); exception when others then rejected:=true; end;
    if not rejected then raise exception 'Unconfirmed submission accepted'; end if;
    perform public.payroll_action(a,'save',jsonb_build_object('due_date',d,'store_id',s,'status','submitted','entries','[]'::jsonb,'confirmed_sections','["pay","information","deductions","recognition"]'::jsonb));
    if m is not null then
      rejected:=false;
      begin perform public.payroll_action(m,'review',jsonb_build_object('due_date',d,'store_id',s,'status','approved')); exception when others then rejected:=true; end;
      if not rejected then raise exception 'GM approved payroll'; end if;
    end if;
  end loop;
  perform public.payroll_action(a,'approve_cycle',jsonb_build_object('due_date',d));
  if exists(select 1 from public.payroll_submissions where due_date=d and status<>'approved') then raise exception 'Final approval did not approve every submitted store'; end if;
  if (select count(*) from public.payroll_email_outbox where due_date=d and kind='payroll')<>1 then raise exception 'Expected exactly one cycle email'; end if;
  rejected:=false;
  begin perform public.payroll_action(a,'approve_cycle',jsonb_build_object('due_date',d)); exception when others then rejected:=true; end;
  if not rejected then raise exception 'Cycle could be approved twice'; end if;
  if has_table_privilege('authenticated','public.payroll_submissions','select') or has_function_privilege('authenticated','public.payroll_action(uuid,text,jsonb)','execute') then raise exception 'Raw payroll bypass exposed'; end if;
  if public.payroll_queue_reminders('2103-06-18T12:00:00Z')<>0 then raise exception 'Reminder queued before the morning window'; end if;
  perform public.payroll_queue_reminders('2103-06-18T15:00:00Z');
  perform public.payroll_queue_reminders('2103-06-18T20:00:00Z');
  if exists(
    select 1 from public.payroll_email_outbox
    where due_date=date '2103-06-18' and kind='reminder'
    group by payload->>'profile_id'
    having count(distinct payload->>'reminder_slot')<>2
  ) then raise exception 'A manager did not receive both reminder slots'; end if;
  if exists(
    select 1 from public.payroll_email_outbox
    where due_date=date '2103-06-18' and kind='reminder'
      and payload->>'reminder_slot' not in ('morning','afternoon')
  ) then raise exception 'Reminder slot was not recorded'; end if;
end $$;
rollback;
