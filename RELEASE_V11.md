# Team Powers Portal v11

- Employees and managers can open Approvals but only see orders they personally submitted.
- Supervisors, accounting, and administrators see the complete order queue.
- Decision controls are limited to supervisors, accounting, and administrators.
- Employees and managers receive a read-only view of status and reviewer notes.

Run `supabase/migrations/202608180010_order_visibility_and_review_roles.sql` before testing role visibility, then deploy the complete v11 package from the GitHub repository root.
