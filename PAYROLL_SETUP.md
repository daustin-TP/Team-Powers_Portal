# Payroll

Payroll is available only to active Managers (GMs), Supervisors and Admins. GM/supervisor store access uses the existing primary store and additional store assignments. Admins review every store and approve the complete cycle. Accounting and employee accounts do not have payroll access.

Cycles repeat every 14 days from October 19, 2026. November 2 covers October 19–November 1. Submissions are due at 4 p.m. America/Chicago. Missing-submission warnings run at 2 p.m. Central, using the active GM's current profile email, not a store contact or a separately entered email. There is no automatic approval. Late submissions remain accepted so payroll can be completed; submitted timestamps are retained.

The four standard sections require explicit review, including “no changes.” Drafts can be incomplete. Submitted records are locked until an admin returns them for correction. Every store must be approved before final cycle approval. Final approval locks the cycle and creates one immutable email snapshot grouped by section, then store. Delivery retries use the same provider idempotency key and stop before the provider's 24-hour idempotency window expires.

PTO/Vacation requests are separate from payroll approval. Submitting a request immediately makes it visible as pending in Team calendar. GMs see their own requests, supervisors additionally see GMs for their assigned stores, and admins see all. Reviewers cannot approve their own requests. Approved leave must also be entered in the applicable payroll submission. Accrued balances, automatic payroll-system updates, and bank-account collection are not implemented.

## Email activation

The initial recipient is daustin@powerspizza.com. No HR recipient has been added.

Set these in the Supabase project's Edge Function secrets (never commit them):

- `RESEND_API_KEY`: sending credential for the approved email provider account.
- `PAYROLL_FROM_EMAIL`: a sender verified in that account, such as a verified company notification address.

The existing uniform site's provider could not be established from its public address. Confirm that it uses Resend before reusing that setup; if it uses another provider, replace the isolated delivery adapter in `supabase/functions/payroll/index.ts`. Until configured, Payroll displays a warning, approved payroll remains queued, and reminders are not sent. Expired warnings are cancelled rather than delivered late.

The migration creates a Vault-protected random worker token and a five-minute cron job. The worker uses its own token authentication (`verify_jwt=false` for this worker only); the user-facing `payroll` function keeps JWT verification on and additionally verifies the active account. No token is stored in GitHub.

Deploy `payroll` with `index.ts` and `model.ts`, and deploy `payroll-worker` with its `index.ts`. Apply the payroll migration. The frontend uses the existing GitHub/Cloudflare deployment.

## Validation

Run `node --test tests/*.test.mjs`, `tsc -b`, and the Vite build. `tests/payroll-database.sql` exercises real transactions with rollback: missing-section rejection, admin-only approval, complete-cycle approval, exactly one queued email, locked cycles, and direct API access denial. Calendar API tests cover each leadership scope and removal of private notes.

Verify delivery with a deliberately reviewed test message after the sender is configured. “Accepted by email provider” is not an inbox delivery guarantee. Inspect failed/queued status in Payroll rather than assuming email was sent.
