import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const context={exports:{},Response,fetch:()=>{},Deno:{env:{get:()=>undefined}}};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../supabase/functions/payroll/resend.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
const resend=context.exports;
const config={apiKey:'re_secret',fromEmail:'noreply@powerspizza.com',fromName:'DASH-OS'};

test('Resend configuration requires an API key and verified sender',()=>{
  const values={RESEND_API_KEY:'re_secret',DASH_FROM_EMAIL:'custom@noreply.powerspizza.com',RESEND_FROM_NAME:'DASH-OS'};
  assert.equal(resend.resendConfig(key=>values[key]).fromEmail,'custom@noreply.powerspizza.com');
  assert.equal(resend.resendConfig(key=>key==='RESEND_API_KEY'?'re_secret':undefined).fromEmail,'notifications@noreply.powerspizza.com');
  assert.equal(resend.resendConfig(()=>undefined),null);
});

test('Resend sends a stable idempotent request without exposing its key in the body',async()=>{
  let call;
  const request=async(url,options)=>{
    call={url,options};
    return new Response(JSON.stringify({id:'resend-id'}),{status:200});
  };
  const id=await resend.sendResendMessage(config,{id:'notification/123',to:'recipient@example.com',subject:'Test',text:'Body',html:'<strong>Body</strong>',attachments:[{filename:'photo.jpg',content:'YWJj'}]},request);
  assert.equal(id,'resend-id');
  assert.equal(call.url,'https://api.resend.com/emails');
  assert.equal(call.options.headers.Authorization,'Bearer re_secret');
  assert.equal(call.options.headers['Idempotency-Key'],'dash-os-notification-123');
  const body=JSON.parse(call.options.body);
  assert.equal(body.from,'DASH-OS <noreply@powerspizza.com>');
  assert.deepEqual(body.to,['recipient@example.com']);
  assert.equal(body.html,'<strong>Body</strong>');
  assert.deepEqual(body.attachments,[{filename:'photo.jpg',content:'YWJj'}]);
  assert.doesNotMatch(call.options.body,/re_secret/);
});

test('Resend retries temporary provider failures but not ambiguous network failures',async()=>{
  await assert.rejects(
    ()=>resend.sendResendMessage(config,{id:'one',to:'recipient@example.com',subject:'Test',text:'Body'},async()=>new Response('{}',{status:429})),
    error=>error.retryable===true,
  );
  await assert.rejects(
    ()=>resend.sendResendMessage(config,{id:'two',to:'recipient@example.com',subject:'Test',text:'Body'},async()=>{throw Error('network');}),
    error=>error.retryable===false,
  );
});
