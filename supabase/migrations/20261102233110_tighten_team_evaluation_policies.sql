-- Split write policies from read policies so SELECT evaluates only one policy.
drop policy if exists "leaders manage private team details" on public.team_member_private_details;
create policy "leaders insert private team details"
on public.team_member_private_details for insert to authenticated
with check (
  (select public.current_portal_role()) in ('manager','supervisor','admin')
  and (select public.can_access_store(store_id))
);
create policy "leaders update private team details"
on public.team_member_private_details for update to authenticated
using (
  (select public.current_portal_role()) in ('manager','supervisor','admin')
  and (select public.can_access_store(store_id))
)
with check (
  (select public.current_portal_role()) in ('manager','supervisor','admin')
  and (select public.can_access_store(store_id))
);

drop policy if exists "leaders manage team positions" on public.team_member_positions;
create policy "leaders insert team positions"
on public.team_member_positions for insert to authenticated
with check (
  (select public.current_portal_role()) in ('manager','supervisor','admin')
  and (select public.can_access_store(store_id))
);
create policy "leaders update team positions"
on public.team_member_positions for update to authenticated
using (
  (select public.current_portal_role()) in ('manager','supervisor','admin')
  and (select public.can_access_store(store_id))
)
with check (
  (select public.current_portal_role()) in ('manager','supervisor','admin')
  and (select public.can_access_store(store_id))
);

create index if not exists team_member_private_details_store_idx on public.team_member_private_details(store_id);
create index if not exists team_member_positions_member_idx on public.team_member_positions(member_id);
create index if not exists team_evaluation_activity_evaluation_idx on public.team_evaluation_activity(evaluation_id);
create index if not exists team_evaluation_activity_store_idx on public.team_evaluation_activity(store_id, created_at desc);
