# Team Powers Portal v10

- Administrators and accounting users can permanently delete uniform, smallwares, receipt, maintenance, and technology requests from their detail windows.
- Deletion requires confirmation and cleans up related order items, progress updates, and uploaded receipt/ticket files.
- Adds a persistent support and suggestions email link to `daustin@powerspizza.com` at the bottom of the portal navigation.

Run `supabase/migrations/202608180009_privileged_request_deletion.sql` in the Supabase SQL Editor before testing request deletion, then deploy the complete v10 package from the GitHub repository root.
