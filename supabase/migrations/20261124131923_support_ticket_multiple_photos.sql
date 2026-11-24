-- Keep up to six private photos on both the original request and each
-- responder update. The legacy image_path stays populated for compatibility
-- with existing reports and older clients.
alter table public.support_tickets
  add column if not exists image_paths text[] not null default '{}';

alter table public.support_ticket_updates
  add column if not exists image_paths text[] not null default '{}';

update public.support_tickets
set image_paths = array[image_path]
where image_path is not null and cardinality(image_paths) = 0;

update public.support_ticket_updates
set image_paths = array[image_path]
where image_path is not null and cardinality(image_paths) = 0;

alter table public.support_tickets
  drop constraint if exists support_tickets_image_paths_limit;
alter table public.support_tickets
  add constraint support_tickets_image_paths_limit
  check (cardinality(image_paths) <= 6);

alter table public.support_ticket_updates
  drop constraint if exists support_ticket_updates_image_paths_limit;
alter table public.support_ticket_updates
  add constraint support_ticket_updates_image_paths_limit
  check (cardinality(image_paths) <= 6);

drop policy if exists "users read permitted ticket images" on storage.objects;
create policy "users read permitted ticket images"
on storage.objects for select to authenticated
using (
  bucket_id = 'ticket-images'
  and (
    public.current_portal_role() in ('supervisor', 'accounting', 'admin')
    or exists (
      select 1 from public.support_tickets t
      where t.submitted_by = (select auth.uid())
        and (
          t.image_path = name
          or name = any(t.image_paths)
          or exists (
            select 1 from public.support_ticket_updates u
            where u.ticket_id = t.id
              and (u.image_path = name or name = any(u.image_paths))
          )
        )
    )
  )
);

comment on column public.support_tickets.image_paths is
  'Private ticket-image storage paths, limited to six; image_path remains the compatibility primary image.';
comment on column public.support_ticket_updates.image_paths is
  'Private responder-update image paths, limited to six; image_path remains the compatibility primary image.';
