import {createClient} from "npm:@supabase/supabase-js@2.110.9";
Deno.serve(async req=>{
  if(req.method!=="POST")return new Response("Method not allowed",{status:405});
  const token=req.headers.get("X-Payroll-Worker");
  if(!token || !/^[a-f0-9]{64}$/.test(token))return new Response("Unauthorized",{status:401});
  const url=Deno.env.get("SUPABASE_URL")!,key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const auth=await db.rpc("payroll_worker_authorized",{token});
  if(auth.error || auth.data!==true)return new Response("Unauthorized",{status:401});
  const result=await fetch(`${url}/functions/v1/payroll`,{method:"POST",headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({action:"deliver"})});
  return new Response(await result.text(),{status:result.status,headers:{"Content-Type":"application/json"}});
});
