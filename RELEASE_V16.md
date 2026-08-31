# Dash-OS KPI Dashboard — V16

This release expands the existing Google Sheets KPI bridge into a permission-aware management dashboard.

## Included

- Whole-company KPI leaderboard
- Supervisor-group filtering based on each supervisor's assigned stores
- Individual-store performance plans and goal editing
- Multiple store assignments per person
- Optional company-wide comparison access for managers and other users
- Automatic company/supervisor/store access for supervisors
- Administrators can see and edit all stores
- Non-administrators can edit goals only for stores assigned to them
- Visible product name updated from `DASH SOS` to `Dash-OS`

## Required Supabase update

Run `supabase/migrations/202608240014_kpi_permissions_and_store_assignments.sql`
in the Supabase SQL Editor. It is safe to run again if an earlier version was
already applied.

Then redeploy the `supabase/functions/kpi-bridge` Edge Function. Its existing
`DASH_SOS_APPS_SCRIPT_URL` and `DASH_SOS_BRIDGE_SECRET` values stay unchanged.

## Access behavior

- **Administrator:** all three view levels and editing for every store.
- **Supervisor:** all three view levels by default, but editing is limited to
  their assigned stores.
- **Manager:** assigned stores only by default. An administrator can enable
  `Company & supervisor comparison` for an individual manager.
- **Other roles:** no KPI access unless an administrator grants it.

Supervisor groups are formed automatically from the supervisors and store
assignments configured under Team Access.
