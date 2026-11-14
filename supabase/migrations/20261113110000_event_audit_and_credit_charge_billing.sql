-- Event attribution plus store billing and supervisor-only company credit charge access.

alter table public.labor_scheduling_events
  add column if not exists created_by_name text,
  add column if not exists updated_by_name text;

create or replace function public.label_labor_scheduling_event_actor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare actor_name text;
begin
  select full_name into actor_name from public.profiles where id = coalesce(new.updated_by,new.created_by);
  if tg_op = 'INSERT' then
    new.created_by_name := coalesce(new.created_by_name,actor_name,'Team Powers leader');
    new.updated_by_name := coalesce(new.updated_by_name,new.created_by_name);
  else
    new.created_by_name := coalesce(old.created_by_name,new.created_by_name,'Team Powers leader');
    new.updated_by_name := coalesce(actor_name,new.updated_by_name,old.updated_by_name,'Team Powers leader');
    new.updated_at := now();
  end if;
  return new;
end;
$$;

update public.labor_scheduling_events event
set created_by_name = coalesce(event.created_by_name,(select full_name from public.profiles where id=event.created_by),'Team Powers leader'),
    updated_by_name = coalesce(event.updated_by_name,(select full_name from public.profiles where id=event.updated_by),(select full_name from public.profiles where id=event.created_by),'Team Powers leader')
where event.created_by_name is null or event.updated_by_name is null;

drop trigger if exists label_labor_scheduling_event_actor_trigger on public.labor_scheduling_events;
create trigger label_labor_scheduling_event_actor_trigger
before insert or update on public.labor_scheduling_events
for each row execute function public.label_labor_scheduling_event_actor();

alter table public.card_receipts
  add column if not exists billing_scope text not null default 'unassigned'
    check (billing_scope in ('unassigned','selected_stores','all_stores','hq_admin')),
  add column if not exists billing_store_ids uuid[] not null default '{}'::uuid[];

drop policy if exists "employees read own receipts" on public.card_receipts;
create policy "company card users read receipts"
on public.card_receipts for select to authenticated
using (
  (public.current_portal_role()::text = 'supervisor' and employee_id = auth.uid())
  or public.current_portal_role()::text in ('accounting','admin')
);

drop policy if exists "employees create own receipts" on public.card_receipts;
create policy "company card users submit receipts"
on public.card_receipts for insert to authenticated
with check (
  employee_id = auth.uid()
  and public.current_portal_role()::text in ('supervisor','admin')
  and billing_scope in ('selected_stores','all_stores','hq_admin')
  and (billing_scope <> 'selected_stores' or cardinality(billing_store_ids) > 0)
);

drop policy if exists "employees upload receipt files" on storage.objects;
create policy "company card users upload receipt files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.current_portal_role()::text in ('supervisor','admin')
);

drop policy if exists "employees read own receipt files" on storage.objects;
create policy "company card users read receipt files"
on storage.objects for select to authenticated
using (
  bucket_id = 'receipts'
  and (
    ((storage.foldername(name))[1] = auth.uid()::text and public.current_portal_role()::text = 'supervisor')
    or public.current_portal_role()::text in ('accounting','admin')
  )
);
