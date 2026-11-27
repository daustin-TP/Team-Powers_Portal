alter table public.labor_team_members
  add column primary_position text,
  add constraint labor_team_members_primary_position_check
    check (
      primary_position is null
      or (
        primary_position in ('manager', 'insider', 'driver')
        and coalesce(primary_position = any(qualified_roles), false)
      )
    );

comment on column public.labor_team_members.primary_position is
  'Optional grouping override for consolidated schedule printouts.';
