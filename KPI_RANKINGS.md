# KPI rankings and supervisor groups

The KPI dashboard shows company ranks for weekly sales dollars, sales PCYA, labor, SPLH, food variance, load, and ADT. Sales has two independent ranks; there is no blended score. Missing metrics are excluded only from that metric's ranking. PCYA requires positive prior-year sales. Ties at displayed precision share a competition rank (1, 1, 3). Counts follow active stores with available results.

Admins assign stores under Team access → Supervisor store groups. A supervisor's primary store is included along with additional assignments. Supervisors can read company performance and switch to their own group. Admins and users with company-comparison permission can select any supervisor group. Goal editing remains limited by existing permissions and assigned stores.

Group sales are summed. Group PCYA uses combined sales for comparable stores only. Other group metrics are explicitly labeled store averages, not weighted company ratios.

## Deployment and portable development

Deploy `supabase/functions/kpi-dashboard/index.ts` and its `analytics.ts` dependency as the `kpi-dashboard` Edge Function with JWT verification enabled before publishing the frontend. It authenticates the current user, calculates company rankings server-side, and returns only authorized raw store data. No new database migration is required; existing profiles, permissions, and store assignments are used.

The frontend deploys from GitHub main through the existing Cloudflare integration. Clone the repository on another computer, install dependencies, and configure the existing Supabase frontend environment variables. Never commit service-role credentials.

Validation: `node --test tests/*.test.mjs` and the TypeScript/Vite production build. The KPI tests cover ranking direction, ties, absent PCYA, group summaries, and server authorization. The browser preview uses demo data when Supabase frontend configuration is absent.
