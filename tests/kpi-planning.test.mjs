import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file,bindings={}) {const context={exports:{},Date,Intl,...bindings};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);return context.exports;}
const analytics=load('../supabase/functions/kpi-dashboard/analytics.ts');
const goals=load('../supabase/functions/kpi-dashboard/goals.ts',{require:()=>analytics});
const planning=load('../supabase/functions/kpi-dashboard/planning.ts',{require:()=>analytics});
test('planning uses Central Mondays including Sunday UTC crossover and DST',()=>{
 assert.equal(goals.planningWeek(new Date('2026-10-19T04:59:00Z')),'2026-10-18');
 assert.equal(goals.planningWeek(new Date('2026-10-19T05:00:00Z')),'2026-10-25');
 assert.equal(goals.planningWeek(new Date('2026-11-02T05:59:00Z')),'2026-11-01');
 assert.equal(goals.planningWeek(new Date('2026-11-02T06:00:00Z')),'2026-11-08');
});
test('automatic comparisons exclude the measured week and all future results',()=>{
 const prior=[{store_id:'s',week_end:'2026-10-11',metrics:{royalty_sales:30000,labor_percent:.23,splh:55}}];
 const expected=goals.automaticGoals(prior,'2026-10-18');
 const changed=[...prior,{store_id:'s',week_end:'2026-10-18',metrics:{royalty_sales:99999,labor_percent:.9}},{store_id:'s',week_end:'2026-10-25',metrics:{royalty_sales:1}}];
 assert.deepEqual(goals.automaticGoals(changed,'2026-10-18'),expected);
 assert.equal(expected.sales,30000);assert.equal(expected.food_variance,null);
 assert.equal(goals.automaticGoals(prior,'2026-10-18',31000).sales,31000);
 assert.equal(goals.automaticGoals([{...prior[0],metrics:{labor_percent:'23%'}}],'2026-10-18').labor,expected.labor);
});
test('regional report flags poor outliers and missed goals, never missing values',()=>{
 const stores=Array.from({length:5},(_,i)=>({id:String(i),name:`Store ${i}`,store_number:String(i)}));
 const results=stores.map((s,i)=>({store_id:s.id,metrics:{avg_adt:i===4?50:20,royalty_sales:i===4?1:100}}));
 const snapshot=planning.regionSnapshot(stores,results,[{store_id:'0',goals:{adt:19}}]);
 assert.equal(snapshot.stores[0].metrics.adt.missed,true);
 assert.equal(snapshot.stores[4].metrics.adt.outlier,true);
 assert.equal(snapshot.stores[4].metrics.sales.outlier,true);
 assert.equal(snapshot.stores[0].metrics.labor.missed,false);
 assert.equal(snapshot.stores[0].metrics.labor.value,null);
 const actions=planning.suggestedActions(snapshot,'2026-10-26');
 assert.ok(actions.length>=3);
 assert.equal(planning.validateActions(actions,new Set(stores.map(s=>s.id))),true);
 assert.equal(planning.validateActions([...actions,actions[0]],new Set(stores.map(s=>s.id))),false);
 assert.equal(planning.validateActions([{...actions[0],due_date:'2026-02-30'}],new Set(stores.map(s=>s.id))),false);
});
function handler(profile,plan) {
 const tables={profiles:[profile,{id:'reviewer',role:'admin',active:true}],kpi_regional_plans:[plan],kpi_weekly_results:[]};
 const client={auth:{getUser:async()=>({data:{user:{id:profile.id}}})},from(name){let rows=tables[name],patch=null,single=false;return {select(){return this},eq(k,v){rows=rows.filter(r=>r[k]===v);return this},in(k,v){rows=rows.filter(r=>v.includes(r[k]));return this},gt(){return this},lte(){return this},order(){return this},limit(){return this},single(){single=true;return this},maybeSingle(){single=true;return this},update(p){patch=p;return this},then(resolve){if(patch)rows.forEach(r=>Object.assign(r,patch));resolve({data:single?rows[0]??null:rows,error:null});}};}};
 return load('../supabase/functions/kpi-plans/index.ts',{require:n=>n.includes('analytics')?analytics:n.includes('goals')?goals:n.includes('planning')?planning:{createClient:()=>client},Deno:{env:{get:()=>''},serve(){}},Response,console}).handlePlans;
}
const request=body=>new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify(body)});
const makePlan=()=>({id:'p',supervisor_id:'sup',reviewer_id:'reviewer',week_end:'2026-10-18',followup_date:'2026-10-26',status:'director_review',version:1,snapshot:{stores:[{id:'s'}]},actions:[{id:'a',store_id:'s',metric:'sales',note:'Original note',action:'Coach',owner:'GM',due_date:'2026-10-26',status:'open',outcome:''}]});
test('supervisors cannot read another region, unreleased drafts, or create reports',async()=>{
 const p=makePlan(),h=handler({id:'sup',role:'supervisor',active:true},p);
 assert.equal((await h(request({action:'results',id:'p'}))).status,403);
 assert.equal((await h(request({action:'create'}))).status,403);
 p.status='released';p.supervisor_id='other';
 assert.equal((await h(request({action:'results',id:'p'}))).status,403);
 const list=await (await h(request({action:'list'}))).json();assert.equal(list.plans.length,0);
});
test('only assigned director releases; release requires action owners; stale versions cannot overwrite',async()=>{
 const p=makePlan();
 const body={...p,action:'save',status:'released',admin_notes:'',director_notes:''};
 assert.equal((await handler({id:'other',role:'admin',active:true},p)(request(body))).status,403);
 const h=handler({id:'reviewer',role:'admin',active:true},p);
 assert.equal((await h(request({...body,actions:[{...p.actions[0],owner:''}]}))).status,400);
 assert.equal((await h(request({...body,version:0}))).status,409);
 assert.equal((await h(request(body))).status,200);assert.equal(p.status,'released');assert.equal(p.version,2);
});
test('supervisor progress cannot rewrite released instructions or close a report',async()=>{
 const p=makePlan();p.status='released';
 const h=handler({id:'sup',role:'supervisor',active:true},p);
 const body={...p,action:'save',followup_notes:'Review complete',actions:[{...p.actions[0],action:'Changed instruction',status:'done',outcome:'Improved'}]};
 assert.equal((await h(request({...body,status:'closed'}))).status,403);
 assert.equal((await h(request(body))).status,200);
 assert.equal(p.actions[0].action,'Coach');assert.equal(p.actions[0].outcome,'Improved');
});

