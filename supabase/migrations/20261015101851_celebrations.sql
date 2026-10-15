-- Additive celebration module. Existing roles, accounts, and store assignments are unchanged.
create schema if not exists celebrations_private;
revoke all on schema celebrations_private from public;
grant usage on schema celebrations_private to authenticated,service_role;

create function celebrations_private.member() returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists (
  select 1 from public.profiles where id=auth.uid() and active and role::text in ('manager','supervisor','admin')
 );
$$;
create function celebrations_private.approver() returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists (
  select 1 from public.profiles where id=auth.uid() and active and role::text='admin' and lower(email)='daustin@powerspizza.com'
 );
$$;
create function celebrations_private.assigned(target_store uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists (
  select 1 from public.profiles p where p.id=auth.uid() and p.active and p.role::text in ('manager','supervisor','admin')
  and (p.role::text='admin' or p.store_id=target_store or exists (
   select 1 from public.profile_store_assignments a where a.profile_id=p.id and a.store_id=target_store
  ))
 );
$$;
revoke all on function celebrations_private.member() from public;
revoke all on function celebrations_private.approver() from public;
revoke all on function celebrations_private.assigned(uuid) from public;
grant execute on function celebrations_private.member(),celebrations_private.approver(),celebrations_private.assigned(uuid) to authenticated;

create function celebrations_private.valid_style(v jsonb) returns boolean
language sql immutable security invoker set search_path = '' as $$
 select case when jsonb_typeof(v)='object' and v ?& array['font','size','x','y','width','color','background','align']
 and jsonb_typeof(v->'size')='number' and jsonb_typeof(v->'x')='number' and jsonb_typeof(v->'y')='number' and jsonb_typeof(v->'width')='number'
 and jsonb_typeof(v->'background')='boolean'
 then (v->>'font') in ('sans','serif','impact','mono','rounded')
 and (v->>'align') in ('left','center','right') and (v->>'color') ~ '^#[0-9A-Fa-f]{6}$'
 and (v->>'size')::numeric between 1.5 and 7 and (v->>'width')::numeric between 25 and 95
 and (v->>'x')::numeric>=0 and (v->>'x')::numeric+(v->>'width')::numeric<=100.01
 and (v->>'y')::numeric between 0 and 85
 else false end;
$$;
revoke all on function celebrations_private.valid_style(jsonb) from public;
grant execute on function celebrations_private.valid_style(jsonb) to authenticated,service_role;

create table public.celebrations (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null references public.stores(id),
 submitted_by uuid not null references public.profiles(id),
 caption text not null check(length(trim(caption)) between 1 and 500),
 category text not null check(category in ('Team wins','Milestones','Birthdays','Anniversaries','Community','Just because')),
 caption_style jsonb not null check(celebrations_private.valid_style(caption_style)),
 original_path text not null unique,
 slide_path text not null unique,
 slide_bytes bigint not null check(slide_bytes between 1 and 15728640),
 status text not null default 'pending' check(status in ('pending','approved','rejected','removed')),
 approved_at timestamptz,
 expires_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(original_path like submitted_by::text||'/'||id::text||'/%'),
 check(slide_path like submitted_by::text||'/'||id::text||'/%'),
 check(original_path<>slide_path),
 check((status in ('pending','rejected') and approved_at is null and expires_at is null) or
       (status in ('approved','removed') and approved_at is not null and expires_at=approved_at+interval '30 days'))
);
create index celebrations_live_idx on public.celebrations(expires_at,approved_at desc) where status='approved';
create index celebrations_store_idx on public.celebrations(store_id,created_at desc);
create index celebrations_submitter_idx on public.celebrations(submitted_by,created_at desc);
alter table public.celebrations enable row level security;
revoke all on public.celebrations from anon,authenticated;
grant select on public.celebrations to authenticated;
grant insert(id,store_id,submitted_by,caption,category,caption_style,original_path,slide_path,slide_bytes) on public.celebrations to authenticated;
grant update(caption,caption_style,slide_path,slide_bytes,status) on public.celebrations to authenticated;
grant all on public.celebrations to service_role;
create policy "celebration members read permitted records" on public.celebrations for select to authenticated using (
 celebrations_private.member() and (
  celebrations_private.approver() or submitted_by=(select auth.uid()) or
  (status='approved' and expires_at>now()) or
  (public.current_portal_role()::text='supervisor' and celebrations_private.assigned(store_id))
 )
);
create policy "assigned leaders submit pending celebrations" on public.celebrations for insert to authenticated with check (
 submitted_by=(select auth.uid()) and celebrations_private.assigned(store_id) and status='pending' and approved_at is null and expires_at is null
);
create policy "only designated approver changes celebrations" on public.celebrations for update to authenticated
 using(celebrations_private.approver()) with check(celebrations_private.approver());

create function celebrations_private.lifecycle() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
 if tg_op='INSERT' then
  new.status:='pending';new.approved_at:=null;new.expires_at:=null;new.created_at:=clock_timestamp();
 else
  if new.id<>old.id or new.store_id<>old.store_id or new.submitted_by<>old.submitted_by or new.original_path<>old.original_path or new.created_at<>old.created_at then
   raise exception 'Celebration identity and original photo are immutable';
  end if;
  new.approved_at:=old.approved_at;new.expires_at:=old.expires_at;
  if new.status<>old.status then
   if old.status='pending' and new.status='approved' then
    new.approved_at:=clock_timestamp();new.expires_at:=new.approved_at+interval '30 days';
   elsif not ((old.status='pending' and new.status='rejected') or (old.status='approved' and new.status='removed')) then
    raise exception 'This celebration cannot change to that status';
   end if;
  end if;
 end if;
 if tg_op='INSERT' or new.slide_path<>old.slide_path then
  if not exists(select 1 from storage.objects where bucket_id='celebrations' and name=new.original_path) then raise exception 'Original photo is missing';end if;
  select (metadata->>'size')::bigint into new.slide_bytes from storage.objects
   where bucket_id='celebrations' and name=new.slide_path and metadata->>'mimetype'='image/png';
  if new.slide_bytes is null then raise exception 'Rendered slide is missing or not PNG';end if;
 elsif new.slide_bytes<>old.slide_bytes then new.slide_bytes:=old.slide_bytes;
 end if;
 new.updated_at:=clock_timestamp();
 return new;
end;
$$;
revoke all on function celebrations_private.lifecycle() from public;
create trigger celebration_lifecycle before insert or update on public.celebrations for each row execute function celebrations_private.lifecycle();

create table public.celebration_playback_keys (
 id uuid primary key default gen_random_uuid(),label text not null check(length(trim(label)) between 1 and 80),
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),active boolean not null default true,
 created_by uuid not null references public.profiles(id),created_at timestamptz not null default now()
);
create index celebration_playback_creator_idx on public.celebration_playback_keys(created_by);
alter table public.celebration_playback_keys enable row level security;
revoke all on public.celebration_playback_keys from anon,authenticated;
grant select,delete on public.celebration_playback_keys to authenticated;
grant insert(label,token_hash,created_by) on public.celebration_playback_keys to authenticated;
grant update(active) on public.celebration_playback_keys to authenticated;
grant all on public.celebration_playback_keys to service_role;
create policy "approver reads playback keys" on public.celebration_playback_keys for select to authenticated using(celebrations_private.approver());
create policy "approver creates playback keys" on public.celebration_playback_keys for insert to authenticated with check(celebrations_private.approver() and created_by=(select auth.uid()));
create policy "approver revokes playback keys" on public.celebration_playback_keys for update to authenticated using(celebrations_private.approver()) with check(celebrations_private.approver());
create policy "approver deletes playback keys" on public.celebration_playback_keys for delete to authenticated using(celebrations_private.approver());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('celebrations','celebrations',false,15728640,array['image/jpeg','image/png','image/webp']);
create policy "leaders upload immutable celebration photos" on storage.objects for insert to authenticated with check (
 bucket_id='celebrations' and celebrations_private.member() and
 (name like (select auth.uid())::text||'/%' or celebrations_private.approver())
);
create policy "leaders read authorized celebration photos" on storage.objects for select to authenticated using (
 bucket_id='celebrations' and celebrations_private.member() and (
  name like (select auth.uid())::text||'/%' or celebrations_private.approver() or exists(
   select 1 from public.celebrations c where c.slide_path=name and
    ((c.status='approved' and c.expires_at>now()) or (public.current_portal_role()::text='supervisor' and celebrations_private.assigned(c.store_id)))
  )
 )
);
create policy "leaders clean unreferenced celebration uploads" on storage.objects for delete to authenticated using (
 bucket_id='celebrations' and celebrations_private.member() and
 (name like (select auth.uid())::text||'/%' or celebrations_private.approver()) and
 not exists(select 1 from public.celebrations c where c.original_path=name or c.slide_path=name)
);
