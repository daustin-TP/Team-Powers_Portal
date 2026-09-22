# Dash-OS Team Access fix

The production screenshot shows an ambiguous Supabase relationship error for
`profiles` and `profile_store_assignments`. The displayed three-person list is
local sample data left behind when the live query fails. It does not establish
that any Supabase users were deleted.

## Deploy the page fix

Upload `src/components/Team.tsx` from this package to that exact path in the
GitHub repository, replacing the old file. Commit to `main`, then wait for the
Cloudflare production deployment to finish. The page now loads profiles and
the optional access tables separately, so this relationship error cannot hide
the directory or leave sample people on screen.

## Check and repair account access

In Supabase SQL Editor, run `supabase/check_team_access.sql` first. Replace the
DCB email filter with the exact address if the query does not return it.

If an account says `Authorized, but portal profile missing`, run
`supabase/migrations/202609220015_activate_existing_invitees.sql` in Supabase
SQL Editor. This also fixes future cases where an invitation is added after a
person's first Auth sign-in. It does not reactivate deliberately disabled
profiles or grant access to users without active invitations.

If the status is `Portal profile disabled`, use the administrator's Team Access
menu to explicitly reactivate that person. If there is no active invitation,
authorize the email in Team Access after the page fix is deployed.

No Apps Script, KPI, or Cloudflare environment-variable change is needed.
