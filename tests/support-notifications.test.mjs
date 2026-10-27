import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const context={exports:{},Set};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../supabase/functions/support-notifications/model.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const model=context.exports;

test('support email identifies the request, store, and lifecycle event',()=>{
  const submitted=model.supportNotificationCopy({event:'submitted',area:'technology',storeName:'Smithville 5491',severity:'red',description:'Internet is down <script>alert(1)</script>',stepsTaken:'Restarted equipment',externalTicketNumber:'ISP-123',photoAttached:true,submittedBy:'Store Manager',actedBy:'Responder',portalUrl:'https://dash.example/'});
  assert.equal(submitted.subject,'[Technology] New request — Smithville 5491');
  assert.match(submitted.text,/Submitted by: Store Manager/);
  assert.match(submitted.text,/Internet is down/);
  assert.match(submitted.text,/ISP-123/);
  assert.match(submitted.html,/DASH-OS/);
  assert.match(submitted.html,/submitted photo is attached/i);
  assert.doesNotMatch(submitted.html,/<script>/);

  const completed=model.supportNotificationCopy({event:'completed',area:'maintenance',storeName:'Baxter 1443',severity:'green',description:'Repair complete',submittedBy:'Manager',actedBy:'District Manager',portalUrl:'https://dash.example/'});
  assert.equal(completed.subject,'[Maintenance] Request completed — Baxter 1443');
  assert.match(completed.text,/Completed by: District Manager/);
});

test('responder recipients are active-email-safe and deduplicated',()=>{
  const recipients=model.uniqueRecipients([
    {id:'1',email:'Responder@powerspizza.com'},
    {id:'2',email:'responder@powerspizza.com'},
    {id:'3',email:null},
    {id:'4',email:'second@powerspizza.com'},
  ]);
  assert.deepEqual(Array.from(recipients,entry=>entry.id),['1','4']);
});
