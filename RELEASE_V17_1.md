# Dash-OS KPI Dashboard — V17.1

V17.1 is the completed deployment package for the KPI detail and live activity
update.

## Included

- Corrected commitment writes for SPLH, Food Variance, Load, and ADT after the
  Google Sheet column reordering.
- Human-readable percentage inputs for Labor and Food Variance and currency
  inputs for Sales and SPLH.
- A new Weekly Metric Totals view containing all 28 fields imported into the
  KPI Database, grouped into Sales & Customers, Labor, Food & Controls, and
  Service.
- Company, supervisor-group, and individual-store filtering on the detailed
  metrics.
- A full store-by-store weekly metric table.
- A live “At a glance” home-page feed sourced from Supabase orders, receipts,
  maintenance tickets, and technology tickets. It respects existing row-level
  security and refreshes automatically.

## Deployment order

1. Replace the Google Apps Script project's `Code.gs` with
   `integrations/google-apps-script/Code.gs`.
2. In Apps Script, update the existing web-app deployment to a **New version**.
   Keep the same URL and bridge secret.
3. Redeploy the Supabase Edge Function from
   `supabase/functions/kpi-bridge/index.ts`.
4. Upload the remaining website files to the GitHub repository and allow
   Cloudflare to build the `main` branch.

No new Supabase SQL migration or environment variable is required for this
release.
