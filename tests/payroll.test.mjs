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
  assert.equal(m.validateEntries([]).length,0);
  assert.equal(m.validateEntries([{...entry,employee:'',effective_date:'',details:''}],false).length,1);
});
test('one email groups by section, then store, and includes no-change confirmations',()=>{
  const content=m.emailBody('2026-11-02',[
    {store_name:'Zulu',entries:[]},
    {store_name:'Alpha',entries:[{section:'recognition',type:'Period Bonus',employee:'Sample',employee_id:'',effective_date:'2026-11-01',amount:'100',hours:'',details:'Period bonus'}]},
  ]);
  assert.ok(content.indexOf('TEAM MEMBER PAY')<content.indexOf('LEADERSHIP BONUSES'));
  assert.ok(content.indexOf('Alpha')<content.indexOf('Zulu'));
  assert.match(content,/No changes reported/);
  assert.match(content,/Period Bonus — Sample/);
});
function handlerFor(role,active=true){
  const profile={id:'user',role,active,store_id:'a'};
  const tables={
    profiles:[profile],profile_store_assignments:[],
    payroll_time_off:[
      {id:'own',requester_id:'user',requester_name:'Own',requester_role:role,store_id:'a',start_date:'2026-11-01',end_date:'2026-11-03',status:'pending',note:'private'},
      {id:'gm-a',requester_id:'gm-a',requester_name:'GM A',requester_role:'manager',store_id:'a',start_date:'2026-11-01',end_date:'2026-11-03',status:'approved',note:'private'},
      {id:'gm-b',requester_id:'gm-b',requester_name:'GM B',requester_role:'manager',store_id:'b',start_date:'2026-11-01',end_date:'2026-11-03',status:'pending',note:'private'},
      {id:'sup-a',requester_id:'sup-a',requester_name:'Other supervisor',requester_role:'supervisor',store_id:'a',start_date:'2026-11-01',end_date:'2026-11-03',status:'pending',note:'private'},
    ],
  };
  const client={auth:{getUser:async()=>({data:{user:{id:'user'}},error:null})},from(name){
    let rows=tables[name],single=false;
    return {select(){return this},eq(k,v){rows=rows.filter(r=>r[k]===v);return this},lte(k,v){rows=rows.filter(r=>r[k]<=v);return this},gte(k,v){rows=rows.filter(r=>r[k]>=v);return this},in(k,vs){rows=rows.filter(r=>vs.includes(r[k]));return this},maybeSingle(){single=true;return this},then(resolve){resolve({data:single?rows[0]:rows,error:null});}};
  }};
  const email={emailConfig:()=>null,checkEmailConnection:async()=>({}),emailDeliveryFailure:()=>({retryable:false,message:'failed'}),sendEmailMessage:async()=>''};
  const ctx={exports:{},require:n=>n.includes('model')?m:n.includes('email')?email:{createClient:()=>client},Deno:{env:{get:()=>'test'},serve:()=>{}},Response};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../supabase/functions/payroll/index.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,ctx);
  return ctx.exports.handlePayroll;
}
const calendarRequest=()=>new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer user-token','Content-Type':'application/json'},body:JSON.stringify({action:'calendar',start:'2026-11-01',end:'2026-11-04'})});
test('time-off calendar uses hierarchy and omits private notes',async()=>{
  for(const [role,ids] of [['manager',['own']],['supervisor',['own','gm-a']],['admin',['own','gm-a','gm-b','sup-a']]]){
    const response=await handlerFor(role)(calendarRequest());assert.equal(response.status,200);
    const result=await response.json();assert.deepEqual(result.requests.map(r=>r.id),ids);
    assert.equal(result.requests.some(r=>'note' in r),false);
  }
});
test('payroll rejects employees, accounting, inactive profiles and unauthenticated callers',async()=>{
  for(const role of ['employee','accounting'])assert.equal((await handlerFor(role)(calendarRequest())).status,403);
  assert.equal((await handlerFor('admin',false)(calendarRequest())).status,403);
  assert.equal((await handlerFor('admin')(new Request('https://example.test',{method:'POST'}))).status,401);
});
