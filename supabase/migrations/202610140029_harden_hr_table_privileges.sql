-- Replace Supabase's default table grants with the narrow HR permission set.
revoke all on table public.hr_disciplinary_actions from anon, authenticated;
revoke all on table public.hr_disciplinary_action_revisions from anon, authenticated;

grant select, insert, update on table public.hr_disciplinary_actions to authenticated;
grant select on table public.hr_disciplinary_action_revisions to authenticated;

create index if not exists hr_disciplinary_actions_last_editor_idx
  on public.hr_disciplinary_actions(last_edited_by)
  where last_edited_by is not null;
