# Closing-driver coverage fix

The forecast engine now keeps the final driver through store close plus the
configured closing-driver clean time. The late-driver setting applies to the
second-to-last driver: one hour before close, at close, or through cleanup with
the final driver. Delivery demand remains a minimum coverage requirement.

Closing coverage is protected during shift consolidation, including low-demand
days and after-midnight closing times. Pre-opening driver shifts also retain
their correct business-day start during optimization.

## Validation

Run `pnpm test` for scheduling regression tests and `pnpm build` for the web app.

## Activate the fix

Deploy `supabase/functions/forecast-engine/index.ts` to the existing Supabase
project's `forecast-engine` Edge Function. A GitHub push or frontend deployment
alone does not update this function. No database migration is required.

After deployment, rebuild Algood's required shifts for the desired week and
verify the final two driver out times against the store's settings. Published
plans and manager-edited shifts remain protected by the existing preservation
logic; review those schedules manually rather than overwriting them.

## Continuing work across computers

Commit and push completed changes to `daustin-TP/Team-Powers_Portal` so the latest
source is available on other computers. Keep local credentials out of Git.
