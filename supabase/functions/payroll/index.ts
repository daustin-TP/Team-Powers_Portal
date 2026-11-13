import { createClient } from "npm:@supabase/supabase-js@2.110.9";
import { emailBody, emailHtml, reminderBody, validCycle, validateEntries } from "./model.ts";
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
          const reminderSlot=mail.payload.reminder_slot==="morning"?"morning":"afternoon";
          const reminderExpired=reminderSlot==="morning"?hour>=14:hour>=16;
          if(local!==mail.due_date || reminderExpired || !profile.data?.active || profile.data.role!=="manager" || !missing.length){
            check(await db.from("payroll_email_outbox").update({status:"cancelled"}).eq("id",mail.id));continue;
          }
          // Always resolve the current account email immediately before delivery.
          mail.recipient=profile.data.email;
          mail.payload.store_names=missing.map(s=>s.name).join(", ");
          mail.payload.reminder_slot=reminderSlot;
        }
        const text=mail.kind==="payroll" ? emailBody(mail.due_date,mail.payload.submissions) :
          reminderBody(mail.due_date,mail.payload.name,mail.payload.store_names,mail.payload.reminder_slot);
        const subject=mail.kind==="payroll"?`Approved payroll — ${mail.due_date}`:`Payroll due today by 4 p.m. — ${mail.due_date}`;
        try{
          const providerId=await sendEmailMessage(email!,{id:mail.id,to:mail.recipient,subject,text,html:emailHtml(subject,text,Deno.env.get("DASH_OS_URL")?.trim()||"https://team-powers-portal.daustin-15d.workers.dev/"),fromName:"DASH-OS Payroll"});
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
    if(body.action==="leave_load"){
      const benefitYear=Number(body.benefit_year);
      const storeId=String(body.store_id??"");
      if(!Number.isInteger(benefitYear)||benefitYear<2026||benefitYear>2100)return json({error:"Choose a valid benefit year."},400);
      if(!/^[0-9a-f-]{36}$/i.test(storeId)||(p.role!=="admin"&&!assigned.has(storeId)))return json({error:"Store access denied"},403);
      const [memberResult,balanceResult,requestResult,leadershipResult]=await Promise.all([
        db.from("labor_team_members").select("id,store_id,profile_id,display_name,qualified_roles,employment_status,management_level").eq("store_id",storeId).eq("active",true).contains("qualified_roles",["manager"]).in("employment_status",["active","borrowed"]).order("display_name"),
        db.from("team_leave_balances").select("member_id,profile_id,pto_hours,vacation_hours").eq("benefit_year",benefitYear),
        db.from("payroll_time_off").select("id,requester_id,requester_name,requester_role,store_id,kind,start_date,end_date,hours,note,status,review_note,reviewed_by,member_id,beneficiary_profile_id,day_portion,unavailable_start,unavailable_end,approval_mode,created_at").gte("start_date",`${benefitYear}-01-01`).lte("start_date",`${benefitYear}-12-31`).order("created_at",{ascending:false}),
        ["supervisor","admin"].includes(p.role)
          ? db.from("profiles").select("id,full_name,role").eq("active",true).in("role",["supervisor","admin"]).order("full_name")
          : Promise.resolve({data:[],error:null}),
      ]);
      [memberResult,balanceResult,requestResult,leadershipResult].forEach(check);
      const balances=balanceResult.data??[];
      const requests=requestResult.data??[];
      const usage=(memberId:string|null,profileId:string|null,kind:"PTO"|"Vacation",status:"pending"|"approved")=>
        requests.filter(r=>r.kind===kind&&r.status===status&&((memberId&&r.member_id===memberId)||(profileId&&r.beneficiary_profile_id===profileId))).reduce((sum,r)=>sum+Number(r.hours||0),0);
      const withBalance=(item:any,subject:"member"|"profile")=>{
        const memberId=subject==="member"?item.id:null,profileId=subject==="profile"?item.id:null;
        const balance=balances.find(b=>subject==="member"?b.member_id===item.id:b.profile_id===item.id);
        const ptoAllocated=Number(balance?.pto_hours||0),vacationAllocated=Number(balance?.vacation_hours||0);
        const ptoReserved=usage(memberId,profileId,"PTO","pending"),ptoUsed=usage(memberId,profileId,"PTO","approved");
        const vacationReserved=usage(memberId,profileId,"Vacation","pending"),vacationUsed=usage(memberId,profileId,"Vacation","approved");
        return {...item,subject,pto_allocated:ptoAllocated,pto_reserved:ptoReserved,pto_used:ptoUsed,pto_available:ptoAllocated-ptoReserved-ptoUsed,vacation_allocated:vacationAllocated,vacation_reserved:vacationReserved,vacation_used:vacationUsed,vacation_available:vacationAllocated-vacationReserved-vacationUsed};
      };
      const members=(memberResult.data??[]).map((member:any)=>({...withBalance(member,"member"),can_auto_approve:p.role==="admin"||(p.role==="supervisor"&&assigned.has(member.store_id))||(p.role==="manager"&&assigned.has(member.store_id)&&member.management_level!=="General Manager"&&member.profile_id!==p.id)}));
      const leadership=(leadershipResult.data??[]).filter((leader:any)=>p.role==="admin"||leader.id===p.id).map((leader:any)=>withBalance(leader,"profile"));
      const visibleRequests=requests.filter((request:any)=>request.store_id===storeId||(!request.store_id&&(p.role==="admin"||request.beneficiary_profile_id===p.id||request.requester_id===p.id))).map((request:any)=>{
        const member=members.find((item:any)=>item.id===request.member_id);
        const canReview=request.status==="pending"&&(p.role==="admin"||(request.store_id&&p.role==="supervisor"&&assigned.has(request.store_id))||(request.store_id&&p.role==="manager"&&assigned.has(request.store_id)&&member?.management_level!=="General Manager"&&member?.profile_id!==p.id));
        return {...request,can_review:canReview,can_cancel:["pending","approved"].includes(request.status)&&(request.requester_id===p.id||canReview||p.role==="admin")};
      });
      return json({ok:true,benefit_year:benefitYear,can_manage_balances:p.role==="admin",members,leadership,requests:visibleRequests});
    }
    if(["leave_save_level","leave_save_balance","leave_request","leave_review","leave_cancel"].includes(body.action)){
      const actionMap:Record<string,string>={leave_save_level:"save_level",leave_save_balance:"save_balance",leave_request:"request",leave_review:"review",leave_cancel:"cancel"};
      const result=await db.rpc("leave_action",{actor:p.id,action:actionMap[body.action],payload:body});
      if(result.error)return json({error:result.error.message},400);
      return json(result.data);
    }
    const canSeeRequest=(r:any)=>r.requester_id===p.id || p.role==="admin" || (r.store_id&&assigned.has(r.store_id)&&["manager","supervisor"].includes(p.role));
    const canReviewRequest=(r:any)=>r.requester_id!==p.id && r.status==="pending" && (p.role==="admin" || (p.role==="supervisor" && r.requester_role==="manager" && assigned.has(r.store_id)));
    if(body.action==="calendar"){
      if(!/^\d{4}-\d{2}-\d{2}$/.test(body.start??"") || !/^\d{4}-\d{2}-\d{2}$/.test(body.end??""))return json({error:"Invalid calendar dates"},400);
      const requests=await db.from("payroll_time_off").select("*").lte("start_date",body.end).gte("end_date",body.start).in("status",["pending","approved"]);check(requests);
      const canSeeCalendarRequest=(r:any)=>r.requester_id===p.id||p.role==="admin"||(r.store_id&&assigned.has(r.store_id)&&["manager","supervisor"].includes(p.role));
      return json({ok:true,requests:(requests.data??[]).filter(canSeeCalendarRequest).map(({id,requester_name,store_id,kind,start_date,end_date,status,day_portion,unavailable_start,unavailable_end,hours}:any)=>({id,requester_name,store_id,kind,start_date,end_date,status,day_portion,unavailable_start,unavailable_end,hours}))});
    }
    if(!validCycle(body.due_date??""))return json({error:"Choose a valid payroll Monday."},400);
    if(body.action==="email_health"){
      if(p.role!=="admin")return json({error:"Only administrators can check the email connection."},403);
      if(!email)return json({error:"The email sender secrets are incomplete."},400);
      const connection=await checkEmailConnection(email);
      return json({ok:true,email_ready:true,...connection});
    }
    if(body.action==="deliver_now"){
      if(p.role!=="admin")return json({error:"Only administrators can send queued payroll email."},403);
      if(!email)return json({error:"The email sender secrets are incomplete."},400);
      const delivery=await fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/payroll`,{
        method:"POST",
        headers:{"Authorization":`Bearer ${serviceKey}`,"Content-Type":"application/json"},
        body:JSON.stringify({action:"deliver"}),
      });
      const result=await delivery.json().catch(()=>({error:"The payroll delivery worker returned an invalid response."}));
      if(!delivery.ok)return json(result,delivery.status);
      return json(result);
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
      if(body.action==="time_off_review"){
        const request=await db.from("payroll_time_off").select("id,requester_id,requester_role,store_id,status").eq("id",String(body.id??"")).maybeSingle();check(request);
        if(!request.data)return json({error:"Time-off request not found."},404);
        const ownCancellation=body.status==="cancelled" && request.data.requester_id===p.id && request.data.status!=="declined";
        const leadershipReview=["approved","declined"].includes(body.status) && canReviewRequest(request.data);
        if(!ownCancellation&&!leadershipReview)return json({error:"You do not have permission to review this time-off request."},403);
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
    return json({ok:true,cycle,stores,submissions:(su.data??[]).filter(s=>ids.has(s.store_id)),requests:(tr.data??[]).filter(canSeeRequest).map(r=>({...r,can_review:canReviewRequest(r)})),emails:out.data,email_ready:emailReady,
      preview:p.role==="admin"?emailBody(body.due_date,su.data??[]):null});
  }catch(error){
    return json({error:error instanceof Error?error.message:"Payroll request failed."},400);
  }
}
Deno.serve(handlePayroll);
