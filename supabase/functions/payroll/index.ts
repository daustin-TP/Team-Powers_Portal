import { createClient } from "npm:@supabase/supabase-js@2.110.9";
import { emailBody, validCycle, validateEntries } from "./model.ts";
import { checkEmailConnection, emailConfig, emailDeliveryFailure, sendEmailMessage } from "./email.ts";

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
    const email=emailConfig();
    const emailReady=Boolean(email);
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
          const providerId=await sendEmailMessage(email!,{id:mail.id,to:mail.recipient,subject:mail.kind==="payroll"?`Approved payroll — ${mail.due_date}`:`Payroll due today by 4 p.m. — ${mail.due_date}`,text,fromName:"DASH-OS Payroll"});
          check(await db.from("payroll_email_outbox").update({status:"sent",sent_at:new Date().toISOString(),provider_id:providerId,recipient:mail.recipient,last_error:null}).eq("id",mail.id));sent++;
        }catch(error){
          const failure=emailDeliveryFailure(error);
          const retryable=failure.retryable && mail.attempts<8;
          const lastError=failure.message;
          check(await db.from("payroll_email_outbox").update({status:retryable?"queued":"failed",last_error:lastError}).eq("id",mail.id));
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
    if(body.action==="email_health"){
      if(p.role!=="admin")return json({error:"Only administrators can check the email connection."},403);
      if(!email)return json({error:"The email sender secrets are incomplete."},400);
      const connection=await checkEmailConnection(email);
      return json({ok:true,email_ready:true,...connection});
    }
    if(body.action==="attachment_upload"||body.action==="attachment_download"){
      const storeId=String(body.store_id??"");
      if(!/^[0-9a-f-]{36}$/i.test(storeId) || (p.role!=="admin"&&!assigned.has(storeId)))return json({error:"Store access denied"},403);
      const store=await db.from("stores").select("id").eq("id",storeId).eq("active",true).maybeSingle();check(store);
      if(!store.data)return json({error:"Choose an active store."},400);
      if(body.action==="attachment_upload"){
        const original=String(body.file_name??"").trim(),mime=String(body.mime_type??"").toLowerCase();
        const allowed=new Set(["image/jpeg","image/png","image/webp","application/pdf"]);
        if(!original||original.length>180||!allowed.has(mime))return json({error:"Attach a JPG, PNG, WebP, or PDF file no larger than 10 MB."},400);
        const safe=original.replace(/[^a-z0-9._-]/gi,"-").replace(/-+/g,"-");
        const path=`${body.due_date}/${storeId}/${p.id}/${crypto.randomUUID()}-${safe}`;
        const signed=await db.storage.from("payroll-attachments").createSignedUploadUrl(path);check(signed);
        return json({ok:true,path,token:signed.data.token});
      }
      const path=String(body.path??"");
      if(!path.startsWith(`${body.due_date}/${storeId}/`))return json({error:"Attachment path is invalid."},400);
      const submission=await db.from("payroll_submissions").select("entries").eq("due_date",body.due_date).eq("store_id",storeId).maybeSingle();check(submission);
      const linked=(submission.data?.entries??[]).some((entry:any)=>entry.attachment_path===path);
      if(!linked)return json({error:"Save this attachment with the payroll submission before opening it."},400);
      const signed=await db.storage.from("payroll-attachments").createSignedUrl(path,900,{download:false});check(signed);
      return json({ok:true,signed_url:signed.data.signedUrl});
    }
    if(body.action!=="load"){
      if(!["save","review","approve_cycle","time_off","time_off_review"].includes(body.action))return json({error:"Unknown action"},400);
      if(body.action==="save")body.entries=validateEntries(body.entries,body.status==="submitted",body.due_date,p.role);
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
