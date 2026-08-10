# Team Powers Portal update

## 1. Update Supabase

Open the Supabase dashboard for the Team Powers project, choose **SQL Editor**, create a new query, paste the complete contents of:

`supabase/migrations/202608100003_catalog_orders_and_account_repair.sql`

Run it once. This creates the catalogs, ordering tables, image bucket, access rules, and repairs `daustin@powerspizza.com` as an active administrator.

## 2. Update GitHub

Upload the contents of this package to the root of `daustin-TP/Team-Powers_Portal`, preserving the folder structure. Do not upload a personal `.env.local` file.

Commit the changes to the `main` branch. Cloudflare should automatically start a production deployment.

## 3. Confirm Cloudflare variables

The Worker build must retain both build variables:

- `VITE_SUPABASE_URL` = `https://mrtihimklvztdpwjfvtz.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = the Supabase publishable key

## 4. Test

Sign out, request a fresh magic link for `daustin@powerspizza.com`, and confirm that **Catalog management** and **Team access** appear. Add one uniform and one smallware product, including a picture, then submit test orders. Finally, open **Reconciliation**, choose a date range, and review a receipt attachment.
