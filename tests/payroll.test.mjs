import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const context={exports:{},Intl,Date};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../supabase/functions/payroll/model.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const m=context.exports;
test('biweekly payroll follows the requested dates and Central calendar across DST',()=>{
  assert.equal(m.validCycle('2026-11-02'),true);
  assert.equal(m.validCycle('2026-10-26'),false);
  assert.equal(m.validCycle('2026-02-30'),false);
  assert.equal(m.addDays('2026-11-02',-14),'2026-10-19');
  assert.equal(m.addDays('2026-11-02',-1),'2026-11-01');
  assert.equal(m.currentCycle(new Date('2026-11-03T02:00:00Z')),'2026-11-02');
  assert.equal(m.currentCycle(new Date('2026-11-03T06:00:00Z')),'2026-11-16');
});
test('payroll validates each request type and limits pay changes to pay-period starts',()=>{
  const entry={section:'pay',type:'Additional Hours',employee:'Test Employee',employee_id:'123',effective_date:'2026-10-25',amount:'',hours:'2',details:'Coverage'};
  assert.equal(m.validateEntries([{...entry,position:'Driver'}],true,'2026-11-02','manager')[0].hours,'2');
  for(const patch of [{employee:''},{effective_date:'2026-02-30'},{hours:'-1'},{section:'other'},{details:''}]){
    assert.throws(()=>m.validateEntries([{...entry,position:'Driver',...patch}],true,'2026-11-02','manager'));
  }
  const pay={section:'pay',type:'Pay Rate Change',employee:'Test Employee',position:'Manager',effective_date:'2026-11-02',amount:'17.5'};
  assert.equal(m.validateEntries([pay],true,'2026-11-02','manager')[0].amount,'17.5');
  assert.throws(()=>m.validateEntries([{...pay,effective_date:'2026-10-26'}],true,'2026-11-02','manager'));
  assert.throws(()=>m.validateEntries([{section:'recognition',type:'Period Bonus',employee:'Test',position:'Manager',effective_date:'2026-11-02',amount:'100'}],true,'2026-11-02','manager'));
  const miscellaneous={section:'additional',type:'Additional Payroll Update',employee:'',effective_date:'',details:'Correct the store payroll total after a duplicate entry.'};
  assert.equal(m.validateEntries([miscellaneous],true,'2026-11-02','manager')[0].effective_date,'');
  assert.equal(m.validateEntries([{...miscellaneous,section:'pay'}],true,'2026-11-02','manager')[0].section,'additional');
  assert.equal(m.validateEntries([{...miscellaneous,effective_date:'2026-11-01'}],true,'2026-11-02','manager')[0].effective_date,'2026-11-01');
  assert.throws(()=>m.validateEntries([{...miscellaneous,effective_date:'2026-02-30'}],true,'2026-11-02','manager'));
  assert.throws(()=>m.validateEntries([{...miscellaneous,details:''}],true,'2026-11-02','manager'));
  assert.equal(m.validateEntries([]).length,0);
  assert.equal(m.validateEntries([{...entry,employee:'',effective_date:'',details:''}],false).length,1);
});
test('one email groups by LLC, category, and store without empty-category filler',()=>{
  const content=m.emailBody('2026-11-02',[
    {store_name:'Jamestown',entries:[{section:'recognition',type:'Period Bonus',employee:'Sample',employee_id:'',effective_date:'2026-11-01',amount:'100',hours:'',details:'Period bonus'}]},
    {store_name:'Sparta',entries:[{section:'pay',type:'PTO / Vacation',employee:'Alex',employee_id:'',effective_date:'2026-10-20',end_date:'2026-10-21',day_portion:'Full day',amount:'',hours:'',details:''}]},
    {store_name:'Baxter',entries:[]},
  ]);
  assert.ok(content.indexOf('POWERS PIZZA')<content.indexOf('PIZZA POWER'));
  assert.ok(content.indexOf('PTO / VACATION')<content.indexOf('MANAGEMENT BONUSES'));
  assert.match(content,/Sparta\n• Alex/);
  assert.match(content,/Jamestown\n• Sample/);
  assert.doesNotMatch(content,/No changes reported|No additional fields/);
  assert.doesNotMatch(content,/Baxter/);
  const miscellaneous=m.emailBody('2026-11-02',[{store_name:'Algood',entries:[{section:'pay',type:'Additional Payroll Update',employee:'',effective_date:'',details:'Correct duplicate payroll entry.'}]}]);
  assert.match(miscellaneous,/ADDITIONAL PAYROLL UPDATES[\s\S]*General payroll update[\s\S]*Description: Correct duplicate payroll entry\./);
});
test('sensitive payroll categories include editable admin placeholders',()=>{
  const entries=[
    {section:'information',type:'Direct Deposit Update',employee:'Direct Test',employee_id:'',effective_date:'',amount:'',hours:'',details:'',acknowledged:true},
    {section:'information',type:'Legal Name Change',employee:'Legal Test',employee_id:'',effective_date:'',new_name:'New Name',amount:'',hours:'',details:'',acknowledged:true},
    {section:'deductions',type:'Partners Foundation Payroll Deduction',employee:'Partner Test',employee_id:'',effective_date:'',amount:'5',hours:'',details:'',attachment_name:'form.pdf'},
  ];
  const content=m.emailBody('2026-11-02',[{store_name:'Smithville',entries}]);
  assert.match(content,/ADD OR ATTACH THE SECURE DIRECT-DEPOSIT INFORMATION/);
  assert.match(content,/ATTACH THE REQUIRED LEGAL NAME-CHANGE DOCUMENTATION/);
  assert.match(content,/ATTACH THE PARTNERS FOUNDATION FORM OR PHOTO/);
});
test('payroll email HTML uses DASH branding and escapes submitted text',()=>{
  const html=m.emailHtml('Payroll <Review>','A & B','https://dash.example/');
  assert.match(html,/DASH-OS/);
  assert.match(html,/Payroll &lt;Review&gt;/);
  assert.match(html,/A &amp; B/);
  assert.doesNotMatch(html,/<Review>/);
  assert.match(html,/Copy-ready summary/);
  assert.match(html,/<pre/);
});
test('Payroll Monday reminders clearly identify the 9 a.m. and 2 p.m. checkpoints',()=>{
  const morning=m.reminderBody('2026-11-16','Alex Manager','Smithville','morning');
  const afternoon=m.reminderBody('2026-11-16','Alex Manager','Smithville','afternoon');
  assert.match(morning,/not been sent in for review/);
  assert.match(morning,/9:00 a\.m\./);
  assert.match(afternoon,/2:00 p\.m\./);
  assert.match(afternoon,/by 4:00 p\.m\. Central/);
});
function handlerFor(role,active=true){
  const profile={id:'user',role,active,store_id:'a'};
  const tables={
    profiles:[profile],profile_store_assignments:[],
    payroll_time_off:[
      {id:'own',requester_id:'user',requester_name:'Own',requester_role:role,store_id:'a',start_date:'2026-11-01',end_date:'2026-11-03',status:'pending',note:'private'},
      {id:'gm-a',requester_id:'gm-a',requester_name:'GM A',requester_role:'manager',store_id:'a',start_date:'2026-11-01',end_date:'2026-11-03',status:'pending',note:'private'},
      {id:'gm-b',requester_id:'gm-b',requester_name:'GM B',requester_role:'manager',store_id:'b',start_date:'2026-11-01',end_date:'2026-11-03',status:'pending',note:'private'},
      {id:'sup-a',requester_id:'sup-a',requester_name:'Other supervisor',requester_role:'supervisor',store_id:'a',start_date:'2026-11-01',end_date:'2026-11-03',status:'pending',note:'private'},
    ],
  };
  const client={auth:{getUser:async()=>({data:{user:{id:'user'}},error:null})},rpc:async()=>({data:{id:'reviewed'},error:null}),from(name){
    let rows=tables[name],single=false;
    return {select(){return this},eq(k,v){rows=rows.filter(r=>r[k]===v);return this},lte(k,v){rows=rows.filter(r=>r[k]<=v);return this},gte(k,v){rows=rows.filter(r=>r[k]>=v);return this},in(k,vs){rows=rows.filter(r=>vs.includes(r[k]));return this},maybeSingle(){single=true;return this},then(resolve){resolve({data:single?rows[0]:rows,error:null});}};
  }};
  const email={emailConfig:()=>({provider:'resend'}),checkEmailConnection:async()=>({}),emailDeliveryFailure:()=>({retryable:false,message:'failed'}),sendEmailMessage:async()=>''};
  const ctx={exports:{},require:n=>n.includes('model')?m:n.includes('email')?email:{createClient:()=>client},Deno:{env:{get:()=>'test'},serve:()=>{}},Response,fetch:async()=>new Response(JSON.stringify({ok:true,sent:1,email_ready:true}),{status:200,headers:{'Content-Type':'application/json'}})};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../supabase/functions/payroll/index.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,ctx);
  return ctx.exports.handlePayroll;
}
const calendarRequest=()=>new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer user-token','Content-Type':'application/json'},body:JSON.stringify({action:'calendar',start:'2026-11-01',end:'2026-11-04'})});
test('time-off calendar uses hierarchy and omits private notes',async()=>{
  for(const [role,ids] of [['manager',['own','gm-a','sup-a']],['supervisor',['own','gm-a','sup-a']],['admin',['own','gm-a','gm-b','sup-a']]]){
    const response=await handlerFor(role)(calendarRequest());assert.equal(response.status,200);
    const result=await response.json();assert.deepEqual(result.requests.map(r=>r.id),ids);
    assert.equal(result.requests.some(r=>'note' in r),false);
  }
});
test('time-off approvals follow administrator and Area Supervisor hierarchy',async()=>{
  const review=(id,status='approved')=>new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer user-token','Content-Type':'application/json'},body:JSON.stringify({action:'time_off_review',due_date:'2026-11-02',id,status})});
  assert.equal((await handlerFor('admin')(review('gm-b'))).status,200);
  const districtApproval=await handlerFor('supervisor')(review('gm-a'));
  assert.equal(districtApproval.status,200,await districtApproval.text());
  assert.equal((await handlerFor('supervisor')(review('gm-b'))).status,403);
  assert.equal((await handlerFor('supervisor')(review('sup-a'))).status,403);
  assert.equal((await handlerFor('manager')(review('gm-a'))).status,403);
  assert.equal((await handlerFor('manager')(review('own','cancelled'))).status,200);
});
test('payroll rejects employees, accounting, inactive profiles and unauthenticated callers',async()=>{
  for(const role of ['employee','accounting'])assert.equal((await handlerFor(role)(calendarRequest())).status,403);
  assert.equal((await handlerFor('admin',false)(calendarRequest())).status,403);
  assert.equal((await handlerFor('admin')(new Request('https://example.test',{method:'POST'}))).status,401);
});
test('only administrators can immediately deliver queued payroll email',async()=>{
  const request=()=>new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer user-token','Content-Type':'application/json'},body:JSON.stringify({action:'deliver_now',due_date:'2026-11-02'})});
  assert.equal((await handlerFor('manager')(request())).status,403);
  const response=await handlerFor('admin')(request());
  assert.equal(response.status,200);
  assert.equal((await response.json()).sent,1);
});

test('layout test delivery is administrator-only, uses the signed-in email, and reads the latest approved cycle',()=>{
  const source=readFileSync(new URL('../supabase/functions/payroll/index.ts',import.meta.url),'utf8');
  assert.match(source,/body\.action==="send_layout_test"/);
  assert.match(source,/p\.role!=="admin"/);
  assert.match(source,/to:p\.email/);
  assert.match(source,/payroll_cycles/);
  assert.match(source,/eq\("status","approved"\)\.order\("due_date",\{ascending:false\}\)/);
  assert.match(source,/TEST EMAIL — REVIEW ONLY/);
  assert.match(source,/does not reopen or change that payroll cycle/);
  const ui=readFileSync(new URL('../src/components/PayrollCenter.tsx',import.meta.url),'utf8');
  assert.match(ui,/Send latest payroll layout test to me/);
});

test('store payroll drafts auto-save after edits without submitting',()=>{
  const source=readFileSync(new URL('../src/components/PayrollCenter.tsx',import.meta.url),'utf8');
  assert.match(source,/status:\"draft\"/);
  assert.match(source,/setTimeout\(\(\)=>void flushAutoSave\(\),700\)/);
  assert.match(source,/autoSaveInFlight\.current/);
  assert.match(source,/autoSaveQueued\.current/);
  assert.match(source,/Draft saved automatically/);
  assert.match(source,/Auto-save needs attention — use Save draft/);
});
