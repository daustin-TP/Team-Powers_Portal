# Team Powers Employee Portal

Standalone employee operations portal with passwordless email sign-in, invitation-only access, role-based permissions, receipt storage, approvals, and reconciliation.

## Access model



- Employees sign in with a one-time email link.
- A valid work email does not grant access by itself.
- An administrator must first add the address to `invited_employees`.
- The first successful sign-in creates the employee profile with the assigned role.
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
