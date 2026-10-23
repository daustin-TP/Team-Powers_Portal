# Weekly goals, trends, and regional plans

## Behavior

The existing weekly screen remains the default. Trends and Regional plans are separate KPI subtabs.

- A results week ending October 18 is compared with goals saved for October 18. Editing the plan from that screen saves goals for October 19–25, keyed by October 25. Calendar boundaries use America/Chicago.
- The latest completed week is the only editable planning screen. Database triggers also reject past-week writes, moving/deleting commitments, or edits after results arrive. Only admins and assigned supervisors can write commitments.
- Automatic targets are saved once per store and target week, both on KPI import and on dashboard load. Corrections to source reports or forecast changes cannot rewrite an existing automatic target. Blank supervisor goals use these saved defaults.
- Older weeks that lack saved automatic goals receive a reconstructed estimate using only results before the measured week. These cannot recover an original forecast that was never stored. Missing metrics remain unscored.
- Trends offers the six KPIs plus PCYA, multiple-store selection, 4/8/12-week views, and an exact-values table. The history window ends at the selected results week. Missing points leave gaps; All Stores is excluded.

## Regional plans preview

1. Admin selects a supervisor and completed results week, then chooses a follow-up on the following Monday or the Monday after that.
2. The report freezes that supervisor's store membership, actuals, comparison targets, and regional summary. It highlights missed goals and unfavorable outliers (over 1.5 population standard deviations from the region mean, minimum four reporting values). Suggestions are rule-based starting points for human review, not causal conclusions.
3. Admin adds region notes and store-specific actions, owners, dates, and notes. An active admin account is assigned as the Director of Ops reviewer; this version does not introduce a new role.
4. Admin hands the draft to Director review. Only that assigned reviewer can release it to the supervisor in Dash, after every action has an owner and instruction. Release locks the snapshot and instructions.
5. The supervisor sees only released/closed reports addressed to their account, can record action progress and outcomes, and sees subsequent imported results through the follow-up week. Admin closes the review when all actions are done. Concurrent edits use a version check.
6. A PDF export includes the snapshot, flags, notes, actions, and follow-up values. Unsaved exports are labeled as drafts. No email is sent and no scheduled email job is created.

## Deployment order

The user approved production deployment on October 23, 2026. The migration and all three functions are deployed; the rollback integration checks passed.

1. Apply `20261021114453_kpi_weekly_planning.sql` to the existing Dash Supabase project. No existing goals or results are rewritten by this migration. It adds two service-only tables, two trigger guards, and narrows goal writes to supervisors/admins.
2. Run `tests/kpi-planning-database.sql` (transaction rolls back), inspect security advisors, and verify the new table grants. RLS is enabled with no user policies on the two service-only tables; authenticated/anon grants are revoked intentionally.
3. Deploy `kpi-dashboard`, `kpi-plans`, and `report-import`, each with JWT verification enabled. Include their relative dependencies from `kpi-dashboard/analytics.ts`, `goals.ts`, and `planning.ts` as needed. Preserve `report-import`'s existing XLSX/JSZip imports.
4. Merge the frontend after the database and functions are ready. Cloudflare builds from main.

## Validation

- 94 unit/integration-harness tests pass, including calendar/DST boundaries, no result leakage into automatic goals, outliers/missing data, role isolation, Director release, conflict handling, and locked instructions.
- TypeScript build and Vite production build pass. The existing large-bundle advisory remains.
- The live database integration script passed and rolled back all test records. Security advisors show the expected service-only table policy notices and existing unrelated warnings.
- Local browser preview could not connect to the desktop development server. Authenticated end-to-end and visual checks remain to be completed after deployment access is approved.
