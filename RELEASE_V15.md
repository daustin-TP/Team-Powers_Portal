# Team Powers Portal v15

- Displays newly authorized emails in a Pending Invitations section immediately after saving.
- Explains that users move to the employee directory after their first successful sign-in.
- Shows the actual Supabase error when authorization fails.
- Rebuilds administrator access to the `invited_employees` table.

Run `supabase/migrations/202608180013_rebuild_invitation_policy.sql`, then deploy the complete v15 package from the GitHub repository root.
