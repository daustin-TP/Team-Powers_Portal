import { createClient } from "npm:@supabase/supabase-js@2.110.9";
import { emailBody, validCycle, validateEntries } from "./model.ts";

const headers = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS", "Content-Type":"application/json" };
const json = (data: unknown, status=200) => new Response(JSON.stringify(data), {status,headers});
const check = (r: {error: unknown}) => { if (r.error) throw Error("The payroll database could not complete the request."); };
export async function handlePayroll(req: Request) {
  if (req.method==="OPTIONS") return new Response("ok",{headers});
  if (req.method!=="POST") return json({error:"Method not allowed"},405);
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db=createClient(Deno.env.get("SUPABASE_URL")!,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  try {
    const token=(req.headers.get("Authorization")??"").replace(/^Bearer\s+/i,"");
    if (!token) return json({error:"Sign in required"},401);
    const body=await req.json();
    const emailReady=Boolean(Deno.env.get("RESEND_API_KEY") && Deno.env.get("PAYROLL_FROM_EMAIL"));
    if(body.action==="deliver"){
      // Scheduled worker: only the server's service-role token can run it.
      if(token!==serviceKey) return json({error:"Not authorized"},403);
      const queued=await db.rpc("payroll_queue_reminders"); check(queued);
      if(!emailReady) return json({ok:true,email_ready:false});
      let sent=0;
      for(let i=0;i<20;i++){
        const claim=await db.rpc("payroll_claim_email");check(claim);
        const mail=claim.data?.[0]; if(!mail)break;
        if(mail.kind==="reminder"){
          const local = new Intl.DateTimeFormat("en-CA",{timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
          const hour=Number(new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",hour:"2-digit",hourCycle:"h23"}).format(new Date()));
          const profile=await db.from("profiles").select("id,active,role,email,store_id").eq("id",mail.payload.profile_id).maybeSingle();check(profile);
          const assignments=await db.from("profile_store_assignments").select("store_id").eq("profile_id",mail.payload.profile_id);check(assignments);
          const ids=[profile.data?.store_id,...(assignments.data??[]).map(a=>a.store_id)].filter(Boolean);
          const stores=await db.from("stores").select("id,name,store_number").in("id",ids).eq("active",true);check(stores);
          const submitted=await db.from("payroll_submissions").select("store_id").eq("due_date",mail.due_date).in("status",["submitted","approved"]);check(submitted);
          const missing=(stores.data??[]).filter(s=>!/^all\s*stores$/i.test(s.name.trim()) && !/^all\s*stores$/i.test((s.store_number??"").trim()) && !(submitted.data??[]).some(x=>x.store_id===s.id));
          if(local!==mail.due_date || hour>=16 || !profile.data?.active || profile.data.role!=="manager" || !missing.length){
            check(await db.from("payroll_email_outbox").update({status:"cancelled"}).eq("id",mail.id));continue;
          }
          // Always resolve the current account email immediately before delivery.
          mail.recipient=profile.data.email;
          mail.payload.store_names=missing.map(s=>s.name).join(", ");
        }
        const text=mail.kind==="payroll" ? emailBody(mail.due_date,mail.payload.submissions) :
          `Hello ${mail.payload.name},\n\nPayroll has not been submitted for ${mail.payload.store_names}.\nPlease submit through Dash-OS by 4:00 p.m. Central today (${mail.due_date}).\n\nThis is the 2:00 p.m. payroll reminder.`;
        try{
          const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":`Bearer ${Deno.env.get("RESEND_API_KEY")}`,"Content-Type":"application/json","Idempotency-Key":`payroll/${mail.id}`},
            body:JSON.stringify({from:Deno.env.get("PAYROLL_FROM_EMAIL"),to:[mail.recipient],subject:mail.kind==="payroll"?`Approved payroll — ${mail.due_date}`:`Payroll due today by 4 p.m. — ${mail.due_date}`,text})});
          const result=await response.json();
          if(!response.ok || !result.id)throw Error("Email provider did not accept the message.");
          check(await db.from("payroll_email_outbox").update({status:"sent",sent_at:new Date().toISOString(),provider_id:result.id,recipient:mail.recipient,last_error:null}).eq("id",mail.id));sent++;
        }catch{
          check(await db.from("payroll_email_outbox").update({status:mail.attempts>=8?"failed":"queued",last_error:"Email delivery could not be confirmed. Retrying safely with the same message identifier."}).eq("id",mail.id));
          break;
        }
      }
      return json({ok:true,sent,email_ready:true});
    }
    const auth=await db.auth.getUser(token);
    if(auth.error || !auth.data.user)return json({error:"Sign in required"},401);
    const pr=await db.from("profiles").select("id,role,active,store_id,full_name").eq("id",auth.data.user.id).maybeSingle();check(pr);
    const p=pr.data;
    if(!p?.active || !["manager","supervisor","admin"].includes(p.role))return json({error:"Payroll is available to GMs and above."},403);
    const assignments=await db.from("profile_store_assignments").select("store_id").eq("profile_id",p.id);check(assignments);
    const assigned=new Set([p.store_id,...(assignments.data??[]).map(a=>a.store_id)].filter(Boolean));
    const canSeeRequest=(r:any)=>r.requester_id===p.id || p.role==="admin" || (p.role==="supervisor" && r.requester_role==="manager" && assigned.has(r.store_id));
    if(body.action==="calendar"){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(body.start??"") || !/^\d{4}-\d{2}-\d{2}$/.test(body.end??""))return json({error:"Invalid calendar dates"},400);
      const requests=await db.from("payroll_time_off").select("*").lte("start_date",body.end).gte("end_date",body.start).in("status",["pending","approved"]);check(requests);
      return json({ok:true,requests:(requests.data??[]).filter(canSeeRequest).map(({id,requester_name,store_id,kind,start_date,end_date,status}:any)=>({id,requester_name,store_id,kind,start_date,end_date,status}))});
    }
    if(!validCycle(body.due_date??""))return json({error:"Choose a valid payroll Monday."},400);
    if(body.action!=="load"){
      if(!["save","review","approve_cycle","time_off","time_off_review"].includes(body.action))return json({error:"Unknown action"},400);
      if(body.action==="save")body.entries=validateEntries(body.entries,body.status==="submitted");
      if(body.action==="time_off"){
        if(!["PTO","Vacation"].includes(body.kind) || !(Number(body.hours)>0) || Number(body.hours)>999999 || !body.start_date || !body.end_date || body.end_date<body.start_date || String(body.note??"").length>2000)throw Error("Enter valid time-off dates and hours.");
      }
      const result=await db.rpc("payroll_action",{actor:p.id,action:body.action,payload:body});
      if(result.error)return json({error:result.error.message},400);
      return json({ok:true,...result.data});
    }
    const ensured=await db.rpc("payroll_action",{actor:p.id,action:"ensure",payload:body});check(ensured);
    const cycle=ensured.data;
    const [st,su,tr,out]=await Promise.all([
      db.from("stores").select("id,name,store_number").in("id",cycle.store_ids).order("name"),
      db.from("payroll_submissions").select("*").eq("due_date",body.due_date),
      db.from("payroll_time_off").select("*").order("start_date",{ascending:false}).limit(1000),
      p.role==="admin"?db.from("payroll_email_outbox").select("id,kind,recipient,status,sent_at,last_error").eq("due_date",body.due_date):Promise.resolve({data:[],error:null})
    ]);
    [st,su,tr,out].forEach(check);
    const stores=(st.data??[]).filter(s=>p.role==="admin" || assigned.has(s.id));
    const ids=new Set(stores.map(s=>s.id));
    return json({ok:true,cycle,stores,submissions:(su.data??[]).filter(s=>ids.has(s.store_id)),requests:(tr.data??[]).filter(canSeeRequest),emails:out.data,email_ready:emailReady,
      preview:p.role==="admin"?emailBody(body.due_date,su.data??[]):null});
  }catch(error){
    return json({error:error instanceof Error?error.message:"Payroll request failed."},400);
  }
}
Deno.serve(handlePayroll);
