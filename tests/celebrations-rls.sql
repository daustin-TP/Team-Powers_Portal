-- All fixture rows, image metadata, assignments and statuses are rolled back.
begin;
select set_config('celebration_test.owner',(select id::text from public.profiles where active and role::text='admin' and lower(email)='daustin@powerspizza.com' limit 1),true);
select set_config('celebration_test.manager',(select id::text from public.profiles where active and role::text='manager' limit 1),true);
select set_config('celebration_test.accounting',(select id::text from public.profiles where active and role::text='accounting' limit 1),true);
select set_config('celebration_test.store',(select id::text from public.stores where active limit 1),true);
select set_config('celebration_test.id',gen_random_uuid()::text,true);
insert into public.profile_store_assignments(profile_id,store_id)
values(current_setting('celebration_test.manager')::uuid,current_setting('celebration_test.store')::uuid) on conflict do nothing;
insert into storage.objects(bucket_id,name,metadata) values
('celebrations',current_setting('celebration_test.manager')||'/'||current_setting('celebration_test.id')||'/original','{"size":100,"mimetype":"image/jpeg"}'),
('celebrations',current_setting('celebration_test.manager')||'/'||current_setting('celebration_test.id')||'/slide.png','{"size":100,"mimetype":"image/png"}');
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('celebration_test.manager'),true);
do $$ begin
 if not celebrations_private.member() or celebrations_private.approver() then raise exception 'manager role check failed';end if;
 if not celebrations_private.assigned(current_setting('celebration_test.store')::uuid) then raise exception 'assigned store check failed';end if;
 if celebrations_private.assigned('00000000-0000-4000-8000-000000000000'::uuid) then raise exception 'unassigned store allowed';end if;
 if has_column_privilege('authenticated','public.celebrations','approved_at','UPDATE') then raise exception 'approval timestamp is writable';end if;
 if has_table_privilege('anon','public.celebrations','SELECT') then raise exception 'anonymous record access';end if;
 if has_function_privilege('anon','celebrations_private.approver()','EXECUTE') then raise exception 'anonymous helper access';end if;
end $$;
insert into public.celebrations(id,store_id,submitted_by,caption,category,caption_style,original_path,slide_path,slide_bytes)
values(current_setting('celebration_test.id')::uuid,current_setting('celebration_test.store')::uuid,current_setting('celebration_test.manager')::uuid,'TEST ONLY','Team wins',
'{"font":"sans","size":3.5,"x":8,"y":70,"width":84,"color":"#ffffff","background":true,"align":"center"}',
current_setting('celebration_test.manager')||'/'||current_setting('celebration_test.id')||'/original',current_setting('celebration_test.manager')||'/'||current_setting('celebration_test.id')||'/slide.png',100);
do $$ declare n integer;begin
 update public.celebrations set status='approved' where id=current_setting('celebration_test.id')::uuid;get diagnostics n=row_count;
 if n<>0 then raise exception 'manager self-approval allowed';end if;
 begin
  insert into public.celebration_playback_keys(label,token_hash,created_by) values('test',repeat('f',64),auth.uid());
  raise exception 'manager created a playback key';
 exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',current_setting('celebration_test.accounting'),true);
do $$ begin
 if celebrations_private.member() then raise exception 'accounting allowed into celebrations';end if;
 if exists(select 1 from public.celebrations where id=current_setting('celebration_test.id')::uuid) then raise exception 'accounting can see pending record';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('celebration_test.owner'),true);
update public.celebrations set status='approved' where id=current_setting('celebration_test.id')::uuid;
do $$ declare a timestamptz;e timestamptz;begin
 select approved_at,expires_at into a,e from public.celebrations where id=current_setting('celebration_test.id')::uuid;
 if a is null or e<>a+interval '30 days' then raise exception 'approval timer incorrect';end if;
 update public.celebrations set caption='EDIT TEST ONLY' where id=current_setting('celebration_test.id')::uuid;
 if not exists(select 1 from public.celebrations where id=current_setting('celebration_test.id')::uuid and approved_at=a and expires_at=e) then raise exception 'caption edit restarted approval';end if;
 begin
  update public.celebrations set caption_style='{"font":"__proto__"}' where id=current_setting('celebration_test.id')::uuid;
  raise exception 'invalid style accepted';
 exception when check_violation then null;end;
 begin
  update public.celebrations set caption_style=jsonb_set(caption_style,'{font}','null'::jsonb) where id=current_setting('celebration_test.id')::uuid;
  raise exception 'JSON-null font accepted';
 exception when check_violation then null;end;
 update public.celebrations set status='removed' where id=current_setting('celebration_test.id')::uuid;
 begin
  update public.celebrations set status='approved' where id=current_setting('celebration_test.id')::uuid;
  raise exception 'removed record could be reapproved';
 exception when raise_exception then
  if sqlerrm='removed record could be reapproved' then raise;end if;
 end;
end $$;
reset role;
rollback;
select 'PASS: manager store scope, no self-approval, restricted playback keys, accounting exclusion, private records, 30-day approval, style validation, immutable approval timer, and lifecycle transitions' as result;
