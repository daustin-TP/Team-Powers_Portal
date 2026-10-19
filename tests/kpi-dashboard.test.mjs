import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function load(file, bindings = {}) {
  const context = { exports: {}, ...bindings };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
}
const analytics = load('../supabase/functions/kpi-dashboard/analytics.ts');
const { rankStores, summarizeGroup, dashboardAccess } = analytics;
const stores = ['a','b','c'].map((id) => ({ id, name: id, store_number: id }));
const results = [
  { store_id: 'a', metrics: { royalty_sales: 100, sales_last_year: 80, labor_percent: .2, splh: 50, food_difference_percent: .01, avg_load: 3, avg_adt: 20 } },
  { store_id: 'b', metrics: { royalty_sales: 200, sales_last_year: 0, labor_percent: .3, splh: 60, food_difference_percent: .02, avg_load: 4, avg_adt: 25 } },
  { store_id: 'c', metrics: { royalty_sales: 100, sales_last_year: 100, labor_percent: .2, splh: 50, food_difference_percent: .01, avg_load: 3, avg_adt: 20 } },
];
test('seven independent ranks use the right direction and competition ties', () => {
  const ranks = rankStores(stores, results);
  assert.equal(ranks[1].metrics.sales.rank, 1);
  assert.equal(ranks[0].metrics.sales.rank, 2);
  assert.equal(ranks[0].metrics.sales.tied, true);
  for (const key of ['labor','food','load','adt']) {
    assert.equal(ranks[0].metrics[key].rank, 1);
    assert.equal(ranks[1].metrics[key].rank, 3);
  }
  assert.equal(ranks[1].metrics.splh.rank, 1);
  assert.equal(ranks[0].metrics.pcya.rank, 1);
  assert.equal(ranks[1].metrics.pcya.rank, null);
  assert.equal(ranks[1].metrics.pcya.eligible, 2);
  assert.equal(ranks[2].metrics.pcya.rank, 2);
});
test('All Stores totals do not occupy ranks or increase ranking counts', () => {
  const combined = { id: 'total', name: ' All Stores ', store_number: null };
  const ranks = rankStores([...stores, combined], [...results, { store_id: 'total', metrics: { royalty_sales: 400 } }]);
  assert.equal(ranks.length, 3);
  assert.equal(ranks[1].metrics.sales.rank, 1);
  assert.equal(ranks[1].metrics.sales.eligible, 3);
  assert.equal(analytics.isIndividualStore(combined), false);
  assert.equal(analytics.isIndividualStore({ id: 'total', name: 'Combined', store_number: 'ALL STORES' }), false);
});
test('missing data is unranked, zero results are real, and store count is dynamic', () => {
  const ranks = rankStores([...stores, {id:'d',name:'New store',store_number:'4'}], [...results,{store_id:'d',metrics:{royalty_sales:0,labor_percent:'N/A'}}]);
  assert.equal(ranks.length, 4);
  assert.equal(ranks[3].metrics.sales.rank, 4);
  assert.equal(ranks[3].metrics.labor.rank, null);
  assert.equal(ranks[3].metrics.pcya.rank, null);
  assert.equal(rankStores(stores, [])[0].metrics.sales.eligible, 0);
});
test('PCYA excludes missing, zero, and negative prior sales, even with a reported zero comp', () => {
  for (const previous of [undefined, null, 0, -1, 'N/A']) {
    assert.equal(analytics.metricValue({royalty_sales:100,sales_last_year:previous,yoy_sales_percent:0}, 'pcya'),null);
  }
  assert.equal(analytics.metricValue({royalty_sales:0,sales_last_year:100},'pcya'),-1);
});
test('group sales include new stores, PCYA only includes comparable stores', () => {
  const summary = summarizeGroup(results);
  assert.equal(summary.values.sales, 400);
  assert.equal(summary.values.pcya, 20 / 180);
  assert.equal(summary.counts.pcya, 2);
  assert.equal(summary.values.splh, 160 / 3);
  assert.equal(summarizeGroup([]).values.sales,null);
});
test('supervisors retain company visibility but edit scope remains assigned stores', () => {
  const access=dashboardAccess({id:'sup',role:'supervisor',active:true,store_id:'a'},[],[{profile_id:'sup',store_id:'b'},{profile_id:'other',store_id:'c'}]);
  assert.equal(access.canViewAll,true);
  assert.deepEqual([...access.assigned].sort(),['a','b']);
  assert.equal(dashboardAccess({id:'sup',role:'supervisor',active:false,store_id:'a'},[],[]).canView,false);
});

function handlerFor(profile, permissions = []) {
  const tables = {
    profiles: [profile, {id:'supervisor',role:'supervisor',active:true,full_name:'Area lead',store_id:'b'}],
    profile_permissions: permissions.map((permission)=>({profile_id:profile.id,permission})),
    profile_store_assignments:[{profile_id:profile.id,store_id:'a'},{profile_id:'supervisor',store_id:'b'}],
    stores:stores.map((store)=>({...store,active:true})),
    kpi_weekly_results:results.map((row)=>({...row,week_end:'2026-10-11'})),
    kpi_goal_commitments: stores.map((store)=>({store_id:store.id,week_end:'2026-10-18',goals:{sales:100}})),
    demand_forecast_runs:[],
  };
  const client = { auth:{getUser:async()=>({data:{user:{id:profile.id}},error:null})}, from(name) {
    let data = tables[name]; let single=false;
    const query={select(){return this},eq(k,v){data=data.filter((r)=>r[k]===v);return this},in(k,vs){data=data.filter((r)=>vs.includes(r[k]));return this},gte(k,v){data=data.filter((r)=>r[k]>=v);return this},lte(k,v){data=data.filter((r)=>r[k]<=v);return this},order(){return this},maybeSingle(){single=true;return this},then(resolve){resolve({data:single?data[0]??null:data,error:null})}};
    return query;
  }};
  return load('../supabase/functions/kpi-dashboard/index.ts', {require:(name)=>name.includes('analytics')?analytics:{createClient:()=>client},Deno:{env:{get:()=> 'test'},serve:()=>{}},Response,console}).handleDashboard;
}
const request = (week='2026-10-11') => new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify({week_end:week})});
test('store-only response ranks against the company without leaking other raw records or groups', async()=>{
  const response=await handlerFor({id:'manager',role:'manager',active:true,store_id:'a'},['kpi_view'])(request());
  assert.equal(response.status,200);const data=await response.json();
  assert.equal(data.company_store_count,3);
  assert.deepEqual(data.results.map((r)=>r.store_id),['a']);
  assert.deepEqual(data.goals.map((r)=>r.store_id),['a']);
  assert.deepEqual(data.history.map((r)=>r.store_id),['a']);
  assert.equal(data.rankings.length,1);assert.equal(data.rankings[0].metrics.sales.rank,2);
  assert.equal(data.access.supervisor_groups.length,0);
});
test('supervisor receives company results and real group membership',async()=>{
  const response=await handlerFor({id:'sup',role:'supervisor',active:true,store_id:'a'})(request());
  const data=await response.json();assert.equal(data.results.length,3);
  assert.deepEqual(data.access.editable_stores,['a']);
  assert.equal(data.access.supervisor_groups.find((g)=>g.id==='supervisor').summary.values.sales,200);
});
test('inactive and unpermitted accounts are rejected; malformed dates fail',async()=>{
  assert.equal((await handlerFor({id:'x',role:'admin',active:false,store_id:null})(request())).status,403);
  assert.equal((await handlerFor({id:'x',role:'employee',active:true,store_id:null})(request())).status,403);
  assert.equal((await handlerFor({id:'x',role:'admin',active:true,store_id:null})(request('2026-02-30'))).status,400);
  assert.equal((await handlerFor({id:'x',role:'admin',active:true,store_id:null})(new Request('https://example.test',{method:'POST'}))).status,401);
});
