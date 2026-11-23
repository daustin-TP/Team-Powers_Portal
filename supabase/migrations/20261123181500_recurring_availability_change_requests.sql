alter table public.team_member_availability_requests
  add column if not exists recurring_status text not null default 'unavailable'
    check (recurring_status in ('available','limited','unavailable'));

alter function public.team_member_portal_action(text,jsonb)
  rename to team_member_portal_action_legacy;

revoke all on function public.team_member_portal_action_legacy(text,jsonb) from public, anon, authenticated;

create function public.team_member_portal_action(action text, payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  email_value text := lower(btrim(coalesce(auth.jwt()->>'email','')));
  m public.labor_team_members%rowtype;
  p public.profiles%rowtype;
  req public.team_member_availability_requests%rowtype;
  scoped uuid[];
  response jsonb;
  request_id uuid;
  weekdays_value integer[];
  status_value text;
  decision_value text;
  note_value text;
  review_value text;
  all_day_value boolean;
  start_clock time;
  end_clock time;
  weekday_value integer;
begin
  if auth.uid() is null then raise exception 'Sign in is required'; end if;

  if action = 'dashboard' then
    response := public.team_member_portal_action_legacy(action,payload);
    select * into m from public.labor_team_members
      where lower(access_email)=email_value and active and employment_status in ('active','borrowed') limit 1;
    if m.id is null then raise exception 'Employee access is not active'; end if;
    return response || jsonb_build_object('standard_availability',coalesce((
      select jsonb_agg(jsonb_build_object(
        'day_of_week',a.day_of_week,'start_time',a.start_time,
        'end_time',a.end_time,'available',a.available
      ) order by a.day_of_week)
      from public.labor_standard_availability a where a.member_id=m.id and a.store_id=m.store_id
    ),'[]'::jsonb));
  end if;

  if action = 'submit' and payload->>'request_kind' = 'recurring' then
    select * into m from public.labor_team_members
      where lower(access_email)=email_value and active and employment_status in ('active','borrowed') limit 1;
    if m.id is null then raise exception 'Employee access is not active'; end if;
    select array_agg(distinct value::integer order by value::integer) into weekdays_value
      from jsonb_array_elements_text(coalesce(payload->'selected_weekdays','[]'::jsonb));
    if coalesce(cardinality(weekdays_value),0)=0
       or exists(select 1 from unnest(weekdays_value) d where d not between 0 and 6) then
      raise exception 'Choose at least one weekday';
    end if;
    status_value := coalesce(payload->>'recurring_status','unavailable');
    if status_value not in ('available','limited','unavailable') then raise exception 'Choose a valid recurring availability'; end if;
    note_value := left(btrim(coalesce(payload->>'note','')),2000);
    if length(note_value) < 5 then raise exception 'A valid reason is required for every recurring availability change'; end if;
    all_day_value := status_value <> 'limited';
    start_clock := case when status_value='limited' then (payload->>'start_time')::time else time '00:00' end;
    end_clock := case when status_value='limited' then (payload->>'end_time')::time else time '23:59' end;
    if start_clock is null or end_clock is null or end_clock <= start_clock then raise exception 'Choose a valid available time range'; end if;
    insert into public.team_member_availability_requests(
      member_id,store_id,request_kind,selected_dates,selected_weekdays,all_day,
      start_time,end_time,note,recurring_status
    ) values(m.id,m.store_id,'recurring','{}',weekdays_value,all_day_value,start_clock,end_clock,note_value,status_value)
    returning id into request_id;
    return jsonb_build_object('ok',true,'request_id',request_id);
  end if;

  if action = 'review' then
    request_id := nullif(payload->>'request_id','')::uuid;
    select * into req from public.team_member_availability_requests where id=request_id for update;
    if req.id is not null and req.request_kind='recurring' then
      select * into p from public.profiles where id=auth.uid() and active;
      if p.id is null or p.role::text not in ('manager','supervisor','admin') then raise exception 'Manager access is required'; end if;
      select array_agg(distinct sid) into scoped from (
        select p.store_id sid union select store_id from public.profile_store_assignments where profile_id=p.id
      ) x where sid is not null;
      if p.role::text <> 'admin' and not coalesce(req.store_id=any(scoped),false) then raise exception 'Store access denied'; end if;
      if req.status <> 'pending' then raise exception 'This request is no longer pending'; end if;
      decision_value := payload->>'decision';
      if decision_value not in ('approved','denied') then raise exception 'Choose approve or deny'; end if;
      review_value := left(btrim(coalesce(payload->>'review_note','')),1000);
      if decision_value='approved' then
        foreach weekday_value in array req.selected_weekdays loop
          delete from public.labor_standard_availability
            where store_id=req.store_id and member_id=req.member_id and day_of_week=weekday_value;
          insert into public.labor_standard_availability(store_id,member_id,day_of_week,start_time,end_time,available)
          values(
            req.store_id,req.member_id,weekday_value,
            case when req.recurring_status='limited' then req.start_time else time '00:00' end,
            case when req.recurring_status='limited' then req.end_time else time '23:59' end,
            req.recurring_status in ('available','limited')
          );
        end loop;
      end if;
      update public.team_member_availability_requests
        set status=decision_value,reviewed_by=p.id,reviewed_at=now(),review_note=review_value,updated_at=now()
        where id=req.id;
      return jsonb_build_object('ok',true,'status',decision_value);
    end if;
  end if;

  return public.team_member_portal_action_legacy(action,payload);
end;
$$;

revoke all on function public.team_member_portal_action(text,jsonb) from public, anon;
grant execute on function public.team_member_portal_action(text,jsonb) to authenticated;
