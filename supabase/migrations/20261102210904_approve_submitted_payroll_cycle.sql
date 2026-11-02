-- Final cycle approval is an administrator's bulk approval. Every active store
-- must have submitted first; returned, draft, or missing submissions still block.
create or replace function public.payroll_action(actor uuid, action text, payload jsonb)
returns jsonb language plpgsql set search_path = public as $$
declare
  p public.profiles; d date; s uuid; c public.payroll_cycles; sub public.payroll_submissions;
  req public.payroll_time_off; scoped uuid[]; snapshot jsonb; result_id uuid;
begin
  select * into p from public.profiles where id=actor and active;
  if p.id is null or p.role::text not in ('manager','supervisor','admin') then raise exception 'Payroll access denied'; end if;
  select array_agg(distinct sid) into scoped from (
    select p.store_id sid union select store_id from public.profile_store_assignments where profile_id=p.id
  ) a where sid is not null;
  if action in ('time_off','time_off_review') then
    if action='time_off' then
      s := nullif(payload->>'store_id','')::uuid;
      if p.role::text='manager' and (s is null or not coalesce(s=any(scoped),false)) then raise exception 'Choose your assigned store'; end if;
      if s is not null and p.role::text <> 'admin' and not coalesce(s=any(scoped),false) then raise exception 'Store access denied'; end if;
      insert into public.payroll_time_off(requester_id,requester_name,requester_role,store_id,kind,start_date,end_date,hours,note)
      values(p.id,p.full_name,p.role::text,s,payload->>'kind',(payload->>'start_date')::date,(payload->>'end_date')::date,(payload->>'hours')::numeric,left(coalesce(payload->>'note',''),2000)) returning id into result_id;
    else
      select * into req from public.payroll_time_off where id=(payload->>'id')::uuid for update;
      if req.id is null then raise exception 'Request not found'; end if;
      if payload->>'status'='cancelled' and req.requester_id=p.id then
        if req.status='declined' then raise exception 'Request already declined'; end if;
      elsif req.requester_id=p.id or not (p.role::text='admin' or (p.role::text='supervisor' and req.requester_role='manager' and coalesce(req.store_id=any(scoped),false))) then
        raise exception 'Review access denied';
      elsif req.status<>'pending' or payload->>'status' not in ('approved','declined') then raise exception 'Request is no longer pending'; end if;
      update public.payroll_time_off set status=payload->>'status',review_note=left(coalesce(payload->>'review_note',''),2000),reviewed_by=p.id where id=req.id;
      result_id := req.id;
    end if;
    return jsonb_build_object('id',result_id);
  end if;
  d := (payload->>'due_date')::date;
  if d is null or (d-date '2026-10-19')%14<>0 then raise exception 'Choose a payroll Monday'; end if;
  perform pg_advisory_xact_lock(hashtext('payroll:'||d::text));
  insert into public.payroll_cycles(due_date,store_ids)
    select d,coalesce(array_agg(id),'{}') from public.stores where active and lower(regexp_replace(name,'\s','','g'))<>'allstores' and lower(regexp_replace(coalesce(store_number,''),'\s','','g'))<>'allstores'
    on conflict do nothing;
  select * into c from public.payroll_cycles where due_date=d for update;
  if action='ensure' then return to_jsonb(c); end if;
  if c.status<>'open' then raise exception 'Approved cycles are locked'; end if;
  if action='approve_cycle' then
    if p.role::text<>'admin' then raise exception 'Only admins can approve payroll'; end if;
    if cardinality(c.store_ids)=0 or exists(
      select 1 from unnest(c.store_ids) sid
      where not exists(
        select 1 from public.payroll_submissions x
        where x.due_date=d and x.store_id=sid and x.status in ('submitted','approved')
      )
    ) then raise exception 'Every store must submit payroll before final approval'; end if;
    update public.payroll_submissions
      set status='approved',updated_by=p.id,updated_at=now()
      where due_date=d and store_id=any(c.store_ids) and status='submitted';
    select jsonb_agg(jsonb_build_object('store_name',store_name,'entries',entries) order by store_name) into snapshot
      from public.payroll_submissions where due_date=d and store_id=any(c.store_ids) and status='approved';
    insert into public.payroll_email_outbox(dedupe_key,kind,due_date,recipient,payload)
      select 'payroll:'||d,'payroll',d,recipient,jsonb_build_object('submissions',snapshot) from public.payroll_settings where id;
    update public.payroll_cycles set status='approved',approved_by=p.id,approved_at=now() where due_date=d;
    return jsonb_build_object('status','approved');
  end if;
  s := (payload->>'store_id')::uuid;
  if not coalesce(s=any(c.store_ids),false) or (p.role::text<>'admin' and not coalesce(s=any(scoped),false)) then raise exception 'Store access denied'; end if;
  select * into sub from public.payroll_submissions where due_date=d and store_id=s for update;
  if action='save' then
    if sub.status in ('submitted','approved') then raise exception 'Return the submission for correction before editing'; end if;
    if payload->>'status' not in ('draft','submitted') then raise exception 'Invalid submission status'; end if;
    if payload->>'status'='submitted' and not (payload->'confirmed_sections' @> '["pay","information","deductions","recognition"]'::jsonb) then raise exception 'Confirm all four sections, including sections with no changes'; end if;
    insert into public.payroll_submissions(due_date,store_id,store_name,entries,confirmed_sections,status,updated_by,submitted_at)
      select d,s,name, payload->'entries',array(select jsonb_array_elements_text(payload->'confirmed_sections')),payload->>'status',p.id,case when payload->>'status'='submitted' then now() end from public.stores where id=s
      on conflict(due_date,store_id) do update set entries=excluded.entries,confirmed_sections=excluded.confirmed_sections,status=excluded.status,updated_by=p.id,updated_at=now(),submitted_at=excluded.submitted_at;
  elsif action='review' then
    if p.role::text<>'admin' then raise exception 'Only admins can approve or return payroll'; end if;
    if sub.id is null or sub.status not in ('submitted','approved') or payload->>'status' not in ('approved','returned') then raise exception 'Submission is not ready for review'; end if;
    if payload->>'status'='returned' and length(trim(coalesce(payload->>'review_note','')))=0 then raise exception 'Explain the requested correction'; end if;
    update public.payroll_submissions set status=payload->>'status',review_note=left(coalesce(payload->>'review_note',''),2000),updated_by=p.id,updated_at=now() where id=sub.id;
  else raise exception 'Unknown payroll action'; end if;
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.payroll_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.payroll_action(uuid,text,jsonb) to service_role;
