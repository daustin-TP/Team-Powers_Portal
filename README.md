# Team Powers Employee Portal

Standalone employee operations portal with passwordless email sign-in, invitation-only access, role-based permissions, KPI tracking, labor scheduling, direct weekly report intake, receipt storage, approvals, and reconciliation.

## KPI and Labor operating system

Dash-OS now contains the web foundations for both management tools:

- KPI company, supervisor, and store views with weekly goals and commitments
- Direct Supabase KPI results and goal storage, with the legacy Google Sheets bridge retained as a temporary fallback
- Labor store settings, roster, standard availability, requested time off, schedule building, SPLH, overtime warnings, publishing, and historical revisions
- Direct report uploads for KPI and Wizardline Sales, All Oven Items, and Delivery Orders files
- Supabase Realtime schedule updates so managers and supervisors can view the same plan

Apply `supabase/migrations/202610010016_kpi_and_labor_operating_system.sql` before enabling the live modules. The upload UI stores and audits original files immediately. The `report-import` Edge Function is the next deployment unit for parsing each exact Wizardline/PDF format into the normalized tables.

## Access model

- Employees sign in with a one-time email link.
- A valid work email does not grant access by itself.
- An administrator must first add the address to `invited_employees`.
- A new Auth sign-in creates the employee profile from an existing invitation.
- If an invitation is added after that person's first Auth sign-in, migration
  `202609220015_activate_existing_invitees.sql` creates the missing profile.
- Supabase Auth users are not automatically portal users; the portal requires an
  active `public.profiles` row with the same Auth user ID.
- Disabling a profile removes portal access immediately.

Roles:

- `employee`: uniforms, payroll authorizations, and personal card receipts
- `manager`: employee features plus request approvals
- `accounting`: receipt review and reconciliation
- `admin`: all features plus employee access management

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Create a Supabase project and add its URL and anonymous key.
3. Apply the SQL files in `supabase/migrations/` in filename order using the Supabase SQL editor.
4. Apply `supabase/seed.sql` before the first administrator signs in.
5. Install dependencies and run `npm run dev`.

Without Supabase environment values, the app opens in a local administrator demonstration mode. This allows layout and workflow review without connecting real employee data.

## Security decisions

- Database row-level security is enabled on every operational table.
- Receipt files are private and separated by employee ID.
- Authorization is enforced in the database, not just the interface.
- Only accounting and administrators can review all receipt files.
- Only administrators can manage employee access.
- Payroll authorizations retain the authenticated employee, signature name, amount, and timestamp.

## Before production

- Connect the real Supabase project.
- Configure the production site URL and permitted redirect URLs.
- Replace demonstration data with live queries and mutations.
- Configure a branded transactional email sender.
- Review payroll authorization wording with the company’s payroll/legal adviser.
- Test each role with a separate work Gmail account.
- Configure backups and retention expectations for receipts and authorization records.
