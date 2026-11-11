import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const context={exports:{},Set};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../supabase/functions/termination-notifications/model.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const model=context.exports;

test('termination email is branded, confidential, and clearly test-only',()=>{
  const copy=model.terminationEmailCopy({employeeName:'Test Employee',storeName:'Smithville 5491',effectiveDate:'2026-11-11',reason:'Policy violation <script>alert(1)</script>',submittedBy:'Store Manager',portalUrl:'https://dash.example/',testMode:true});
  assert.match(copy.subject,/^\[TEST\]/);
  assert.match(copy.text,/outside HR provider/i);
  assert.match(copy.text,/Smithville 5491/);
  assert.match(copy.html,/DASH-OS/);
  assert.match(copy.html,/CONFIDENTIAL HR/);
  assert.doesNotMatch(copy.html,/<script>/);
});

test('termination recipients are valid, normalized, and deduplicated',()=>{
  const recipients=model.uniqueEmails(['Admin@PowersPizza.com',' admin@powerspizza.com ','bad-address','second@example.com']);
  assert.deepEqual(Array.from(recipients),['admin@powerspizza.com','second@example.com']);
});
