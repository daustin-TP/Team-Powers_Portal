-- Payroll data is accessed only through the authenticated payroll Edge Function.
create table public.payroll_cycles (
  due_date date primary key check ((due_date - date '2026-10-19') % 14 = 0),
  store_ids uuid[] not null,
  status text not null default 'open' check (status in ('open','approved')),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz
);
create table public.payroll_submissions (
  id uuid primary key default gen_random_uuid(),
  due_date date not null references public.payroll_cycles(due_date),
  store_id uuid not null references public.stores(id),
  store_name text not null,
  entries jsonb not null default '[]' check (jsonb_typeof(entries)='array'),
  confirmed_sections text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','submitted','returned','approved')),
  review_note text not null default '',
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique (due_date,store_id)
);
create table public.payroll_time_off (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id),
  requester_name text not null,
  requester_role text not null,
  store_id uuid references public.stores(id),
  kind text not null check (kind in ('PTO','Vacation')),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  hours numeric(8,2) not null check (hours > 0),
  note text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','declined','cancelled')),
  review_note text not null default '',
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.payroll_email_outbox (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  kind text not null check (kind in ('payroll','reminder')),
  due_date date not null,
  recipient text not null,
  payload jsonb not null,
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','cancelled')),
  attempts integer not null default 0,
  started_at timestamptz,
  first_attempt_at timestamptz,
  sent_at timestamptz,
  provider_id text,
  last_error text,
  created_at timestamptz not null default now()
);
create table public.payroll_settings (
  id boolean primary key default true check (id),
  recipient text not null default 'daustin@powerspizza.com'
);
insert into public.payroll_settings(id) values(true);
create index payroll_submissions_store_idx on public.payroll_submissions(store_id,due_date);
create index payroll_time_off_requester_idx on public.payroll_time_off(requester_id,start_date);
create index payroll_time_off_store_idx on public.payroll_time_off(store_id,start_date,end_date);
create index payroll_outbox_status_idx on public.payroll_email_outbox(status,created_at);
alter table public.payroll_cycles enable row level security;
alter table public.payroll_submissions enable row level security;
alter table public.payroll_time_off enable row level security;
alter table public.payroll_email_outbox enable row level security;
alter table public.payroll_settings enable row level security;
revoke all on public.payroll_cycles, public.payroll_submissions, public.payroll_time_off, public.payroll_email_outbox, public.payroll_settings from anon, authenticated;
grant all on public.payroll_cycles, public.payroll_submissions, public.payroll_time_off, public.payroll_email_outbox, public.payroll_settings to service_role;

-- Invoker function: only the service role can execute. All user actions use a
-- verified getUser identity supplied by the Edge Function, never client identity.
create function public.payroll_action(actor uuid, action text, payload jsonb)
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
    if cardinality(c.store_ids)=0 or exists(select 1 from unnest(c.store_ids) sid where not exists(select 1 from public.payroll_submissions x where x.due_date=d and x.store_id=sid and x.status='approved')) then raise exception 'Review and approve every store before approving the cycle'; end if;
    select jsonb_agg(jsonb_build_object('store_name',store_name,'entries',entries) order by store_name) into snapshot from public.payroll_submissions where due_date=d and store_id=any(c.store_ids);
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

create function public.payroll_queue_reminders(at_time timestamptz default now())
returns integer language plpgsql set search_path=public as $$
declare local_time timestamp := at_time at time zone 'America/Chicago'; d date; n integer;
begin
  d:=local_time::date;
  if (d-date '2026-10-19')%14<>0 or local_time::time < time '14:00' or local_time::time >= time '16:00' then return 0; end if;
  insert into public.payroll_email_outbox(dedupe_key,kind,due_date,recipient,payload)
  select 'reminder:'||d||':'||p.id,'reminder',d,p.email,jsonb_build_object('profile_id',p.id,'name',p.full_name,'store_names',string_agg(s.name,', ' order by s.name))
  from public.profiles p join public.stores s on (s.id=p.store_id or exists(select 1 from public.profile_store_assignments a where a.profile_id=p.id and a.store_id=s.id))
  where p.active and p.role::text='manager' and coalesce(p.email,'')<>'' and s.active
    and lower(regexp_replace(s.name,'\s','','g'))<>'allstores'
    and not exists(select 1 from public.payroll_submissions x where x.due_date=d and x.store_id=s.id and x.status in ('submitted','approved'))
    and not exists(select 1 from public.payroll_cycles c where c.due_date=d and c.status='approved')
  group by p.id,p.email,p.full_name on conflict(dedupe_key) do nothing;
  get diagnostics n=row_count; return n;
end $$;
revoke all on function public.payroll_queue_reminders(timestamptz) from public,anon,authenticated;
grant execute on function public.payroll_queue_reminders(timestamptz) to service_role;

create function public.payroll_claim_email()
returns setof public.payroll_email_outbox language plpgsql set search_path=public as $$
begin
  -- Resend idempotency lasts 24 hours: never automatically retry past that window.
  update public.payroll_email_outbox set status='failed',last_error='Delivery requires administrator reconciliation before retry.'
    where status in ('sending','queued') and first_attempt_at < now()-interval '23 hours';
  return query update public.payroll_email_outbox set status='sending',attempts=attempts+1,started_at=now(),first_attempt_at=coalesce(first_attempt_at,now())
    where id=(select id from public.payroll_email_outbox where (status='queued' or (status='sending' and started_at < now()-interval '10 minutes')) and attempts<8 order by created_at for update skip locked limit 1) returning *;
end $$;
revoke all on function public.payroll_claim_email() from public,anon,authenticated;
grant execute on function public.payroll_claim_email() to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- A dedicated random worker token remains in Vault; no service key is stored in cron.
select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'payroll_worker_token')
where not exists(select 1 from vault.secrets where name='payroll_worker_token');
create schema if not exists payroll_private;
revoke all on schema payroll_private from public,anon,authenticated;
create function payroll_private.worker_authorized(token text)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not null or coalesce(current_setting('request.jwt.claims',true)::jsonb->>'role','') <> 'service_role' then return false; end if;
  return exists(select 1 from vault.decrypted_secrets where name='payroll_worker_token' and decrypted_secret=token);
end $$;
revoke all on function payroll_private.worker_authorized(text) from public,anon,authenticated;
grant usage on schema payroll_private to service_role;
grant execute on function payroll_private.worker_authorized(text) to service_role;
create function public.payroll_worker_authorized(token text)
returns boolean language sql set search_path='' as $$ select payroll_private.worker_authorized(token) $$;
revoke all on function public.payroll_worker_authorized(text) from public,anon,authenticated;
grant execute on function public.payroll_worker_authorized(text) to service_role;
select cron.schedule('payroll-delivery-every-five-minutes','*/5 * * * *',$job$
  select net.http_post(
    url := 'https://mrtihimklvztdpwjfvtz.supabase.co/functions/v1/payroll-worker',
    headers := jsonb_build_object('Content-Type','application/json','X-Payroll-Worker',(select decrypted_secret from vault.decrypted_secrets where name='payroll_worker_token')),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$job$);
