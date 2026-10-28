import { createClient } from 'npm:@supabase/supabase-js@2.110.9';
import { dashboardAccess, isIndividualStore, rankStores, summarizeGroup } from './analytics.ts';
import { automaticGoals, planningWeek } from './goals.ts';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Content-Type': 'application/json' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const addDays = (date: string, days: number) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

export async function handleDashboard(request: Request) {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405);
  try {
    const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ ok: false, error: 'Sign in is required.' }, 401);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return json({ ok: false, error: 'Your sign-in session is no longer valid.' }, 401);
    const [profileResult, permissionsResult, ownAssignments] = await Promise.all([
      admin.from('profiles').select('id,role,active,store_id').eq('id', auth.user.id).maybeSingle(),
      admin.from('profile_permissions').select('permission').eq('profile_id', auth.user.id),
      admin.from('profile_store_assignments').select('profile_id,store_id').eq('profile_id', auth.user.id),
    ]);
    for (const result of [profileResult, permissionsResult, ownAssignments]) if (result.error) throw result.error;
    if (!profileResult.data) return json({ ok: false, error: 'KPI access is not active.' }, 403);
    const profile = profileResult.data;
    const access = dashboardAccess(profile, (permissionsResult.data ?? []).map((p) => p.permission), ownAssignments.data ?? []);
    if (!access.canView) return json({ ok: false, error: 'You do not have KPI access.' }, 403);
    const { week_end: weekEnd } = await request.json();
    if (typeof weekEnd !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(weekEnd) || !Number.isFinite(Date.parse(weekEnd)) || new Date(weekEnd).toISOString().slice(0, 10) !== weekEnd) return json({ ok: false, error: 'A valid week-ending date is required.' }, 400);

    // Cross-store reads are needed to rank assigned stores against the company.
    // Only authorized stores' raw rows/ranks leave this endpoint.
    const [storesResult, companyResults, supervisorsResult, assignmentsResult] = await Promise.all([
      admin.from('stores').select('id,name,store_number').eq('active', true).order('name'),
      admin.from('kpi_weekly_results').select('store_id,week_end,metrics').eq('week_end', weekEnd),
      access.canViewAll ? admin.from('profiles').select('id,full_name,store_id').eq('role', 'supervisor').eq('active', true).order('full_name') : Promise.resolve({ data: [], error: null }),
      access.canViewAll ? admin.from('profile_store_assignments').select('profile_id,store_id') : Promise.resolve({ data: [], error: null }),
    ]);
    for (const result of [storesResult, companyResults, supervisorsResult, assignmentsResult]) if (result.error) throw result.error;
    const stores = (storesResult.data ?? []).filter(isIndividualStore);
    const visibleStores = stores.filter((store) => access.canViewAll || access.assigned.has(store.id));
    const visibleIds = new Set(visibleStores.map((store) => store.id));
    const storeMap = new Map(stores.map((store) => [store.id, store]));
    const label = (id: string) => storeMap.get(id)?.store_number || storeMap.get(id)?.name || '';
    const results = (companyResults.data ?? []).filter((row) => storeMap.has(row.store_id));
    const groups = (supervisorsResult.data ?? []).map((supervisor) => {
      const ids = new Set((assignmentsResult.data ?? []).filter((a) => a.profile_id === supervisor.id).map((a) => a.store_id));
      if (supervisor.store_id) ids.add(supervisor.store_id);
      const groupStores = stores.filter((store) => ids.has(store.id));
      return { id: supervisor.id, name: supervisor.full_name || 'Unnamed District Manager', stores: groupStores.map((store) => label(store.id)), store_ids: groupStores.map((store) => store.id), summary: summarizeGroup(results.filter((row) => ids.has(row.store_id))) };
    });
    const ids = [...visibleIds];
    const [goalsResult, historyResult, forecastResult] = ids.length ? await Promise.all([
      admin.from('kpi_goal_commitments').select('store_id,week_end,goals,focus_area,action_plan,owner').in('store_id', ids).in('week_end', [weekEnd, addDays(weekEnd, 7)]),
      admin.from('kpi_weekly_results').select('store_id,week_end,metrics').in('store_id', ids).gte('week_end', addDays(weekEnd, -371)).lte('week_end', weekEnd).order('week_end'),
      admin.from('demand_forecast_runs').select('store_id,week_start,confidence_score,confidence_level,weekly_projection').in('store_id', ids).in('week_start', [addDays(weekEnd, 1), addDays(weekEnd, 8)]).eq('is_current', true),
    ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
    for (const result of [goalsResult, historyResult, forecastResult]) if (result.error) throw result.error;
    // Freeze defaults once. Historical gaps use only observations before the measured week.
    const automaticRows = ids.flatMap(store_id => [weekEnd, addDays(weekEnd, 7)].map(target => ({
      store_id, week_end: target, reconstructed: target < planningWeek(),
      goals: automaticGoals((historyResult.data ?? []).filter(r => r.store_id === store_id), target,
        target > weekEnd ? (forecastResult.data ?? []).find(f => f.store_id === store_id && f.week_start === addDays(target,-6))?.weekly_projection?.projected_sales : undefined),
    }))).filter(row => Object.values(row.goals).some(value => value !== null));
    if (automaticRows.length) {
      const { error } = await admin.from('kpi_automatic_goals').upsert(automaticRows, { onConflict: 'store_id,week_end', ignoreDuplicates: true });
      if (error) throw error;
    }
    const automatic = ids.length ? await admin.from('kpi_automatic_goals').select('*').in('store_id',ids).in('week_end',[weekEnd,addDays(weekEnd,7)]) : {data:[],error:null};
    if (automatic.error) throw automatic.error;
    return json({ ok: true, week_end: weekEnd, company_store_count: stores.filter(isIndividualStore).length,
      stores: visibleStores,
      rankings: rankStores(stores, results).filter((row) => visibleIds.has(row.store_id)),
      results: results.filter((row) => visibleIds.has(row.store_id)).map((row) => ({ ...row, stores: storeMap.get(row.store_id), metrics: { ...row.metrics, store_number: label(row.store_id) } })),
      goals: goalsResult.data ?? [], automatic_goals: automatic.data ?? [], history: historyResult.data ?? [],
      forecasts: (forecastResult.data ?? []).map((row) => ({ ...row, store: label(row.store_id) })),
      access: { can_edit: access.canEdit, can_view_all: access.canViewAll, assigned_stores: stores.filter((store) => access.assigned.has(store.id)).map((store) => label(store.id)), editable_stores: profile.role === 'admin' ? null : stores.filter((store) => access.assigned.has(store.id)).map((store) => label(store.id)), supervisor_groups: groups },
    });
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: 'The KPI dashboard could not be loaded. Please retry.' }, 500);
  }
}
Deno.serve(handleDashboard);
