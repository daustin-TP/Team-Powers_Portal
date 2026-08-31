# Dash-OS KPI Dashboard — V17

## Commitment bridge correction

The live `Goal Commitments` worksheet now contains 54 columns through BB. The
earlier bridge was still using its pre-reorder 47-column layout. V17 matches
the current live headers:

- Sales commitment: E
- Labor commitment: P
- SPLH commitment: X
- Food Variance commitment: AE
- Load commitment: AL
- ADT commitment: AS

The bridge now reads the correct result/status columns through Overall Status
in BB and also imports the Extreme Order goal and variance.

## Input formatting

- Sales and SPLH display with a dollar sign.
- Labor and Food Variance display as percentages.
- A displayed commitment of `19.5%` is safely written to Google Sheets as
  `0.195`, which the worksheet formats as `19.5%`.
- The Google Apps Script bridge also accepts either decimal or human-readable
  percentage input to prevent accidental scaling errors.

## Weekly metric totals

The KPI Dashboard now has two top-level views:

1. **Commitments** — the existing clean goal, status, leaderboard, and action
   plan experience.
2. **Weekly metric totals** — grouped totals and averages for all 28 imported
   KPI Database metrics, plus a complete store-by-store table.

Company, supervisor-group, and individual-store access filters apply to both
views.

## Required Google Apps Script update

Replace the Apps Script project's `Code.gs` with
`integrations/google-apps-script/Code.gs`, then create a new version of the
existing web-app deployment. The Apps Script URL and bridge secret stay the
same.

## Required Supabase Edge Function update

Redeploy `supabase/functions/kpi-bridge/index.ts`. The function now securely
passes the `get_weekly_metrics` request through to Google Apps Script while
applying the same company, supervisor-group, and store access rules.

## Live home-page activity

The “At a glance” section now reads permitted orders, receipts, and maintenance
or technology tickets from Supabase. It refreshes after database changes, when
the browser regains focus, and every 30 seconds as a fallback. Row-level
security continues to determine which records each user can see.
