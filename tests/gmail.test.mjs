import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const context={exports:{},TextEncoder,btoa,URLSearchParams,Response,Date,fetch:()=>{},Deno:{env:{get:()=>undefined}}};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../supabase/functions/payroll/gmail.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const gmail=context.exports;
const config={clientId:'client',clientSecret:'secret',refreshToken:'refresh',fromEmail:'noreply@powerspizza.com',fromName:'DASH-OS'};

test('Gmail configuration requires every protected credential',()=>{
  const values={GOOGLE_GMAIL_CLIENT_ID:'client',GOOGLE_GMAIL_CLIENT_SECRET:'secret',GOOGLE_GMAIL_REFRESH_TOKEN:'refresh',GOOGLE_GMAIL_FROM_EMAIL:'noreply@powerspizza.com',GOOGLE_GMAIL_FROM_NAME:'DASH-OS'};
  assert.equal(gmail.gmailConfig(key=>values[key]).fromEmail,'noreply@powerspizza.com');
  assert.equal(gmail.gmailConfig(key=>key==='GOOGLE_GMAIL_CLIENT_ID'?'client':undefined),null);
});

test('Gmail message is RFC-compatible, UTF-8 safe, and uses a stable message id',()=>{
  const raw=gmail.gmailRawMessage({id:'abc-123',to:'payroll@powerspizza.com',subject:'Approved payroll — 2026-11-02',text:'Hello\nPayroll ready.'},config);
  const normalized=raw.replace(/-/g,'+').replace(/_/g,'/');
  const mime=Buffer.from(normalized+'='.repeat((4-normalized.length%4)%4),'base64').toString('utf8');
  assert.match(mime,/From: .*<noreply@powerspizza\.com>/);
  assert.match(mime,/To: payroll@powerspizza\.com/);
  assert.match(mime,/Message-ID: <dash-os-abc-123@powerspizza\.com>/);
  assert.doesNotMatch(raw,/[+/=]/);
});

test('Gmail refresh and send exchange only server-side secrets',async()=>{
  const calls=[];
  const request=async(url,options)=>{
    calls.push({url,options});
    return url.includes('oauth2')?new Response(JSON.stringify({access_token:'access'}),{status:200}):new Response(JSON.stringify({id:'gmail-id'}),{status:200});
  };
  const id=await gmail.sendGmailMessage(config,{id:'outbox',to:'recipient@example.com',subject:'Test',text:'Body'},request);
  assert.equal(id,'gmail-id');
  assert.match(String(calls[0].options.body),/refresh_token=refresh/);
  assert.equal(calls[1].options.headers.Authorization,'Bearer access');
  assert.doesNotMatch(calls[1].options.body,/refresh|secret/);
});

test('ambiguous Gmail network failure is not automatically retried',async()=>{
  let count=0;
  const request=async()=>{count++;if(count===1)return new Response(JSON.stringify({access_token:'access'}),{status:200});throw Error('network');};
  await assert.rejects(()=>gmail.sendGmailMessage(config,{id:'outbox',to:'recipient@example.com',subject:'Test',text:'Body'},request),error=>error.retryable===false);
});
