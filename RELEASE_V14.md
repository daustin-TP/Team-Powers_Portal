# Team Powers Portal v14

- Adds an explicit client-side ownership filter for employee and manager support-ticket lists.
- Rebuilds all live Maintenance and Technology read policies to remove any older permissive policy.
- Supervisors, accounting, and administrators continue to see every support request.

Run `supabase/migrations/202608180012_rebuild_support_visibility_policies.sql`, then deploy the complete v14 package from the GitHub repository root. Sign out and back in before retesting the manager account.
