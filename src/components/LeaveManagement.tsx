import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Save, ShieldCheck, Umbrella } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { Profile } from "../types";

const managementLevels = ["MIT","Shift Lead Level 1","Shift Lead Level 2","Shift Lead Level 3","Assistant Manager","General Manager"] as const;
type ManagementLevel = typeof managementLevels[number];
type BenefitSubject = {
  id:string; subject:"member"|"profile"; display_name?:string; full_name?:string; role?:string;
  management_level?:ManagementLevel|null; profile_id?:string|null; store_id?:string;
  can_auto_approve?:boolean;
  pto_allocated:number; pto_reserved:number; pto_used:number; pto_available:number;
  vacation_allocated:number; vacation_reserved:number; vacation_used:number; vacation_available:number;
};
type LeaveRequest = {
  id:string; requester_name:string; kind:"PTO"|"Vacation"; start_date:string; end_date:string; hours:number;
  note:string; status:"pending"|"approved"|"declined"|"cancelled"; review_note:string; member_id:string|null;
  beneficiary_profile_id:string|null; day_portion:"full"|"half"|"remaining"|null;
  unavailable_start:string|null; unavailable_end:string|null; approval_mode:"approval"|"notification";
  can_review:boolean; can_cancel:boolean;
};
type LeaveData = { benefit_year:number; can_manage_balances:boolean; members:BenefitSubject[]; leadership:BenefitSubject[]; requests:LeaveRequest[] };

const today=()=>new Date().toISOString().slice(0,10);
const displayTime=(value:string|null)=>{if(!value)return"";const [h,m]=value.slice(0,5).split(":").map(Number);return new Date(2000,0,1,h,m).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"});};
const addHours=(value:string,hours:number)=>{const [h,m]=value.split(":").map(Number);const total=h*60+m+Math.round(hours*60);return `${String(Math.floor(total/60)%24).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`;};
const dayCount=(start:string,end:string)=>start&&end&&end>=start?Math.round((Date.parse(end)-Date.parse(start))/86400000)+1:0;
const nameOf=(subject:BenefitSubject)=>subject.display_name||subject.full_name||"Team member";
const roleLabel=(role?:string)=>role==="supervisor"?"Area Supervisor":role==="admin"?"Administrator":"Above-store leader";

export default function LeaveManagement({profile,storeId,onAvailabilityChanged}:{profile:Profile;storeId:string;onAvailabilityChanged:()=>Promise<void>|void}){
  const currentYear=new Date().getFullYear();
  const [year,setYear]=useState(currentYear);
  const [data,setData]=useState<LeaveData|null>(null);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [error,setError]=useState(""),[message,setMessage]=useState("");
  const [allocations,setAllocations]=useState<Record<string,{pto:string;vacation:string}>>({});
  const [form,setForm]=useState({subject:"",kind:"PTO" as "PTO"|"Vacation",start_date:today(),end_date:today(),day_portion:"full" as "full"|"half"|"remaining",unavailable_start:"09:00",note:"",approve_now:false});

  const invoke=useCallback(async(action:string,payload:Record<string,unknown>={})=>{
    if(!supabase)throw Error("DASH database is not configured.");
    const {data:result,error:invokeError}=await supabase.functions.invoke("payroll",{body:{action,store_id:storeId,benefit_year:year,...payload}});
    if(invokeError||result?.error){
      let detail=result?.error as string|undefined;
      const response=(invokeError as {context?:Response}|null)?.context;
      if(!detail&&response){
        try{detail=(await response.clone().json() as {error?:string})?.error;}catch{/* Keep the transport error below. */}
      }
      throw Error(detail||invokeError?.message||"The PTO / Vacation request could not be completed.");
    }
    return result;
  },[storeId,year]);

  const load=useCallback(async()=>{
    if(!storeId||!supabase)return;
    setLoading(true);setError("");
    try{
      const result=await invoke("leave_load") as LeaveData;
      setData(result);
      const next:Record<string,{pto:string;vacation:string}>={};
      [...result.members,...result.leadership].forEach(subject=>{next[`${subject.subject}:${subject.id}`]={pto:String(subject.pto_allocated),vacation:String(subject.vacation_allocated)};});
      setAllocations(next);
      const eligible=[...result.members,...result.leadership];
      setForm(current=>({...current,subject:eligible.some(item=>`${item.subject}:${item.id}`===current.subject)?current.subject:(eligible[0]?`${eligible[0].subject}:${eligible[0].id}`:"")}));
    }catch(loadError){setError((loadError as Error).message);}finally{setLoading(false);}
  },[invoke,storeId]);
  useEffect(()=>{void load();},[load]);

  const subjects=useMemo(()=>data?[...data.members,...data.leadership]:[],[data]);
  const selected=subjects.find(item=>`${item.subject}:${item.id}`===form.subject);
  const available=selected?(form.kind==="PTO"?selected.pto_available:selected.vacation_available):0;
  const days=dayCount(form.start_date,form.end_date);
  const requestedHours=form.day_portion==="full"?days*8:form.day_portion==="half"?days*4:available;
  const unavailableEnd=form.day_portion==="full"?"23:59":addHours(form.unavailable_start,form.day_portion==="half"?4:Math.max(0,available));
  const canUseRemaining=available>0&&available<4&&days===1;

  const mutate=async(action:string,payload:Record<string,unknown>,success:string)=>{
    setBusy(true);setError("");setMessage("");
    try{await invoke(action,payload);setMessage(success);await load();await onAvailabilityChanged();}
    catch(mutationError){setError((mutationError as Error).message);}finally{setBusy(false);}
  };
  const saveLevel=(subject:BenefitSubject,managementLevel:string)=>mutate("leave_save_level",{member_id:subject.id,management_level:managementLevel},"Management level saved.");
  const saveBalance=(subject:BenefitSubject)=>{
    const key=`${subject.subject}:${subject.id}`,draft=allocations[key]||{pto:"0",vacation:"0"};
    return mutate("leave_save_balance",{member_id:subject.subject==="member"?subject.id:null,profile_id:subject.subject==="profile"?subject.id:null,pto_hours:Number(draft.pto),vacation_hours:Number(draft.vacation)},"Annual PTO and Vacation balances saved.");
  };
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(!selected){setError("Choose a team member.");return;}
    if(form.day_portion==="remaining"&&!canUseRemaining){setError("Remaining-hours requests are available only when the selected balance is below four hours.");return;}
    await mutate("leave_request",{
      member_id:selected.subject==="member"?selected.id:null,profile_id:selected.subject==="profile"?selected.id:null,
      kind:form.kind,start_date:form.start_date,end_date:form.end_date,day_portion:form.day_portion,
      unavailable_start:form.day_portion==="full"?"00:00":form.unavailable_start,
      unavailable_end:unavailableEnd,note:form.note,approve_now:form.approve_now,
    },selected.subject==="profile"?"Above-store time off recorded.":"PTO / Vacation request saved.");
    setForm(current=>({...current,note:"",approve_now:false}));
  };

  if(loading&&!data)return <section className="panel activity-empty"><Clock3 className="spin"/>Loading PTO and Vacation…</section>;
  return <div className="leave-management">
    {error&&<p className="inline-message labor-error"><AlertTriangle size={18}/>{error}</p>}
    {message&&<p className="inline-message labor-success"><CheckCircle2 size={18}/>{message}</p>}
    <section className="panel leave-heading">
      <div><p className="eyebrow">Annual leadership benefits</p><h2>PTO &amp; Vacation</h2><p>Pending requests reserve hours. Approved store requests automatically become one-time availability restrictions in the scheduler.</p></div>
      <label>Benefit year<select value={year} onChange={event=>setYear(Number(event.target.value))}>{[currentYear-1,currentYear,currentYear+1].filter(value=>value>=2026).map(value=><option key={value}>{value}</option>)}</select></label>
    </section>

    <section className="panel leave-balance-panel">
      <div className="table-toolbar"><div><p className="eyebrow">Store leadership</p><h2>Management levels and balances</h2><p>Manager-qualified roster employees appear automatically. Annual allocations reset by benefit year and never carry forward automatically.</p></div></div>
      {!data?.members.length?<div className="activity-empty">No active manager-qualified employees are on this store roster.</div>:<div className="responsive-table"><table className="leave-balance-table"><thead><tr><th>Team member</th><th>Management level</th><th>PTO</th><th>Vacation</th><th></th></tr></thead><tbody>{data.members.map(subject=>{
        const key=`member:${subject.id}`,draft=allocations[key]||{pto:"0",vacation:"0"};
        return <tr key={subject.id}><td><strong>{nameOf(subject)}</strong></td><td><select value={subject.management_level||""} disabled={busy} onChange={event=>void saveLevel(subject,event.target.value)}><option value="">Select level</option>{managementLevels.map(level=><option key={level}>{level}</option>)}</select></td><td><div className="leave-balance-cell">{data.can_manage_balances?<input type="number" min="0" step="1" value={draft.pto} onChange={event=>setAllocations(current=>({...current,[key]:{...draft,pto:event.target.value}}))}/>:<strong>{subject.pto_allocated}</strong>}<small>{subject.pto_available} available · {subject.pto_reserved} pending · {subject.pto_used} used</small></div></td><td><div className="leave-balance-cell">{data.can_manage_balances?<input type="number" min="0" step="1" value={draft.vacation} onChange={event=>setAllocations(current=>({...current,[key]:{...draft,vacation:event.target.value}}))}/>:<strong>{subject.vacation_allocated}</strong>}<small>{subject.vacation_available} available · {subject.vacation_reserved} pending · {subject.vacation_used} used</small></div></td><td>{data.can_manage_balances&&<button className="button secondary compact" disabled={busy} onClick={()=>void saveBalance(subject)}><Save size={14}/>Save</button>}</td></tr>;
      })}</tbody></table></div>}
    </section>

    {Boolean(data?.leadership.length)&&<section className="panel leave-balance-panel"><div className="table-toolbar"><div><p className="eyebrow">Above-store leadership</p><h2>Area Supervisors and administrators</h2><p>These balances are separate from store rosters. Time off is recorded as a leadership notification and does not create a store availability entry.</p></div></div><div className="responsive-table"><table className="leave-balance-table"><thead><tr><th>Leader</th><th>Role</th><th>PTO</th><th>Vacation</th><th></th></tr></thead><tbody>{data!.leadership.map(subject=>{const key=`profile:${subject.id}`,draft=allocations[key]||{pto:"0",vacation:"0"};return <tr key={subject.id}><td><strong>{nameOf(subject)}</strong></td><td>{roleLabel(subject.role)}</td><td><div className="leave-balance-cell">{data!.can_manage_balances?<input type="number" min="0" step="1" value={draft.pto} onChange={event=>setAllocations(current=>({...current,[key]:{...draft,pto:event.target.value}}))}/>:<strong>{subject.pto_allocated}</strong>}<small>{subject.pto_available} available · {subject.pto_reserved} pending · {subject.pto_used} used</small></div></td><td><div className="leave-balance-cell">{data!.can_manage_balances?<input type="number" min="0" step="1" value={draft.vacation} onChange={event=>setAllocations(current=>({...current,[key]:{...draft,vacation:event.target.value}}))}/>:<strong>{subject.vacation_allocated}</strong>}<small>{subject.vacation_available} available · {subject.vacation_reserved} pending · {subject.vacation_used} used</small></div></td><td>{data!.can_manage_balances&&<button className="button secondary compact" disabled={busy} onClick={()=>void saveBalance(subject)}><Save size={14}/>Save</button>}</td></tr>})}</tbody></table></div></section>}

    <div className="leave-workspace">
      <form className="panel leave-request-form" onSubmit={submit}><div><p className="eyebrow">Manager-entered request</p><h2>Request time off</h2><p>Choose “approve now” when the decision is already made. Otherwise, the hours remain reserved while the request awaits review.</p></div>
        <label>Team member<select required value={form.subject} onChange={event=>setForm({...form,subject:event.target.value,approve_now:false})}><optgroup label="Store leadership">{data?.members.map(subject=><option key={subject.id} value={`member:${subject.id}`}>{nameOf(subject)}{subject.management_level?` · ${subject.management_level}`:""}</option>)}</optgroup>{Boolean(data?.leadership.length)&&<optgroup label="Above-store leadership">{data!.leadership.map(subject=><option key={subject.id} value={`profile:${subject.id}`}>{nameOf(subject)} · {roleLabel(subject.role)}</option>)}</optgroup>}</select></label>
        <div className="leave-form-row"><label>Type<select value={form.kind} onChange={event=>setForm({...form,kind:event.target.value as "PTO"|"Vacation",day_portion:"full"})}><option>PTO</option><option>Vacation</option></select></label><label>Time used<select value={form.day_portion} onChange={event=>setForm({...form,day_portion:event.target.value as typeof form.day_portion})}><option value="full">Full day · 8 hours</option><option value="half">Half day · 4 hours</option>{canUseRemaining&&<option value="remaining">Use remaining {available} hours</option>}</select></label></div>
        <div className="leave-form-row"><label>First day<input required type="date" value={form.start_date} onChange={event=>setForm({...form,start_date:event.target.value,end_date:form.end_date<event.target.value?event.target.value:form.end_date})}/></label><label>Last day<input required type="date" min={form.start_date} value={form.end_date} onChange={event=>setForm({...form,end_date:event.target.value})}/></label></div>
        {form.day_portion!=="full"&&<div className="leave-form-row"><label>Unavailable starting<input required type="time" step="900" value={form.unavailable_start} onChange={event=>setForm({...form,unavailable_start:event.target.value})}/></label><label>Unavailable through<input disabled value={displayTime(unavailableEnd)}/></label></div>}
        <div className="leave-request-summary"><Umbrella size={18}/><span><strong>{requestedHours} requested hour{requestedHours===1?"":"s"}</strong><small>{available} {form.kind} hours currently available</small></span></div>
        {selected?.subject==="member"&&selected.can_auto_approve&&<label className="check-row"><input type="checkbox" checked={form.approve_now} onChange={event=>setForm({...form,approve_now:event.target.checked})}/><span><strong>Approve this request now</strong><small>Leave unchecked to reserve the hours and leave the request pending.</small></span></label>}
        {selected?.subject==="member"&&!selected.can_auto_approve&&<p className="leave-routing-note"><ShieldCheck size={16}/>This request will remain pending for the appropriate Area Supervisor or administrator.</p>}
        {selected?.subject==="profile"&&<p className="leave-routing-note"><ShieldCheck size={16}/>Above-store time off is recorded as a notification; no approval email is sent.</p>}
        <label>Notes <span className="optional-label">Optional</span><textarea rows={3} maxLength={2000} value={form.note} onChange={event=>setForm({...form,note:event.target.value})}/></label>
        <button className="button primary" disabled={busy||!selected||requestedHours<=0}>{busy?"Saving…":"Submit request"}</button>
      </form>

      <section className="panel leave-request-list"><div className="table-toolbar"><div><p className="eyebrow">Request history</p><h2>Pending and completed</h2><p>Pending hours are reserved. Declined or cancelled requests return those hours automatically.</p></div></div>{!data?.requests.length?<div className="activity-empty">No PTO or Vacation requests are recorded for {year}.</div>:<div className="leave-cards">{data.requests.map(request=><article className={`leave-card ${request.status}`} key={request.id}><header><div><strong>{request.requester_name}</strong><span>{request.kind} · {request.status}</span></div><b>{request.hours} hrs</b></header><p>{request.start_date===request.end_date?request.start_date:`${request.start_date} – ${request.end_date}`}{request.day_portion==="half"||request.day_portion==="remaining"?` · ${displayTime(request.unavailable_start)}–${displayTime(request.unavailable_end)}`:" · full day"}</p>{request.note&&<small>{request.note}</small>}{request.approval_mode==="notification"&&<small>Above-store notification</small>}{request.review_note&&<small>Review: {request.review_note}</small>}<div className="button-row">{request.can_review&&<><button className="button primary compact" disabled={busy} onClick={()=>void mutate("leave_review",{id:request.id,status:"approved"},"Request approved and added to scheduler availability.")}>Approve</button><button className="button secondary compact" disabled={busy} onClick={()=>{const note=window.prompt("Reason for declining this request");if(note!==null)void mutate("leave_review",{id:request.id,status:"declined",review_note:note},"Request declined and reserved hours released.");}}>Decline</button></>}{request.can_cancel&&<button className="button secondary compact danger" disabled={busy} onClick={()=>{if(window.confirm("Cancel this request and release its hours?"))void mutate("leave_cancel",{id:request.id},"Request cancelled and reserved hours released.");}}>Cancel</button>}</div></article>)}</div>}</section>
    </div>
  </div>;
}

