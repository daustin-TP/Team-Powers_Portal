import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(path,bindings={}){const ctx={exports:{},Intl,Date,console,...bindings};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,ctx);return ctx.exports;}
const analytics=load('../supabase/functions/kpi-dashboard/analytics.ts');
const planning=load('../supabase/functions/kpi-dashboard/planning.ts',{require:()=>analytics});
const {buildRegionalReportPdf}=load('../src/lib/regionalReportPdf.ts',{require:name=>name==='jspdf'?require('jspdf'):analytics});
const stores=[{id:'a',name:'Sample North',store_number:'1001'},{id:'b',name:'Sample South',store_number:'1002'}];
const history=Array.from({length:12},(_,i)=>{const d=new Date('2026-11-08T12:00:00Z');d.setUTCDate(d.getUTCDate()-(11-i)*7);return stores.map((s,j)=>({store_id:s.id,week_end:d.toISOString().slice(0,10),metrics:{royalty_sales:27000+i*500-j*1500,sales_last_year:26000,labor_percent:.255-i*.002+j*.01,splh:52+i*.6,food_difference_percent:.022-i*.0006,avg_load:4.2-i*.08,avg_adt:25-i*.25}}));}).flat();
const snapshot=planning.regionSnapshot(stores,history.filter(r=>r.week_end==='2026-11-01'),stores.map(s=>({store_id:s.id,goals:{sales:33000,labor:.23,splh:58,food_variance:.015,load:3.5,adt:22}})));
const plan={supervisor_id:'sample',week_end:'2026-11-01',followup_date:'2026-11-16',status:'released',snapshot:{...snapshot,supervisor_name:'Sample District / Demonstration data'},admin_notes:'Focus on service consistency while maintaining sales growth. Confirm the staffing plan is aligned with the busiest dayparts.',director_notes:'Prioritize peak-hour deployment and make-line flow. Review each action with the GM, agree on an owner, and bring evidence to the next follow-up.',followup_notes:'Sales continue to improve. Service times need another week of observation before closing the plan.',actions:[{id:'a1',store_id:'a',metric:'sales',note:'Use local outreach to support the next school event.',action:'Review the dinner sales pattern and confirm local outreach by Friday.',owner:'North GM',due_date:'2026-11-13',status:'in_progress',outcome:'Outreach scheduled; results will be reviewed next Monday.'},{id:'a2',store_id:'a',metric:'adt',note:'Coach dispatch during peak periods.',action:'Observe Friday dinner dispatch and adjust driver deployment.',owner:'North GM / District Manager',due_date:'2026-11-13',status:'open',outcome:''},{id:'b1',store_id:'b',metric:'labor',note:'Avoid reducing coverage during the busiest hours.',action:'Align opening and shoulder shifts with demand; review overtime before posting.',owner:'South GM',due_date:'2026-11-13',status:'done',outcome:'Schedule reviewed and adjustments posted.'}]};
test('formatted PDF includes snapshot, priorities, store actions and eight-week trends',()=>{
 const doc=buildRegionalReportPdf(plan,history.filter(r=>r.week_end>plan.week_end),false,{history});
 const pdf=doc.output();assert.match(pdf,/8-week view/);assert.match(pdf,/Store comparison/);assert.match(pdf,/Director of Ops/);assert.match(pdf,/Outcome/);assert.ok(doc.internal.pageSize.getHeight()>doc.internal.pageSize.getWidth());assert.ok(doc.getNumberOfPages()<=7);
 if(process.env.PDF_PREVIEW_OUTPUT){mkdirSync(dirname(process.env.PDF_PREVIEW_OUTPUT),{recursive:true});writeFileSync(process.env.PDF_PREVIEW_OUTPUT,Buffer.from(doc.output('arraybuffer')));}
});
test('trend controls support 4 and 12 weeks, can omit graphs, and label unsaved output',()=>{
 for(const weeks of [4,12])assert.match(buildRegionalReportPdf(plan,[],true,{history,trendWeeks:weeks}).output(),new RegExp(`${weeks}-week view`));
 const pdf=buildRegionalReportPdf(plan,[],true,{includeTrends:false}).output();assert.doesNotMatch(pdf,/week view/);assert.match(pdf,/UNSAVED DRAFT/);
});
test('long notes and ownership cells paginate without dropping their endings',()=>{
 const longPlan={...plan,admin_notes:'Detailed leadership context. '.repeat(300)+'ADMINENDMARKER',actions:[{...plan.actions[0],owner:'Coverage responsibility '.repeat(150)+'OWNERENDMARKER'}]};
 const doc=buildRegionalReportPdf(longPlan,[],false,{includeTrends:false});const pdf=doc.output();assert.match(pdf,/ADMINENDMARKER/);assert.match(pdf,/OWNERENDMARKER/);
 if(process.env.PDF_PREVIEW_OUTPUT)writeFileSync(process.env.PDF_PREVIEW_OUTPUT.replace('.pdf','-long.pdf'),Buffer.from(doc.output('arraybuffer')));
});


