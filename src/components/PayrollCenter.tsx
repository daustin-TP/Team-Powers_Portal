import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Profile } from "../types";
import { addDays, currentCycle, sections, type Entry } from "../../supabase/functions/payroll/model";

type Store={id:string;name:string};
type Submission={id:string;store_id:string;store_name:string;entries:Entry[];confirmed_sections:string[];status:string;review_note:string;submitted_at:string|null};
type TimeOff={id:string;requester_id:string;requester_name:string;requester_role:string;store_id:string|null;kind:string;start_date:string;end_date:string;hours:number;status:string;review_note:string;note:string};
type Data={cycle:{status:string};stores:Store[];submissions:Submission[];requests:TimeOff[];emails:{id:string;kind:string;recipient:string;status:string;last_error:string|null}[];email_ready:boolean;preview:string};
const blank=(section:string,_due=""):Entry=>({section,type:sections.find(s=>s.key===section)!.types[0],employee:"",employee_id:"",effective_date:"",end_date:"",day_portion:"Full day",position:"",new_position:"",new_name:"",new_address:"",amount:"",hours:"",acknowledged:false,details:"",attachment_path:"",attachment_name:"",attachment_type:""});
export default function PayrollCenter({profile}:{profile:Profile}){
  const [due,setDue]=useState(currentCycle),[store,setStore]=useState(""),[data,setData]=useState<Data|null>(null);
  const [entries,setEntries]=useState<Entry[]>([]),[confirmed,setConfirmed]=useState<string[]>([]),[dirty,setDirty]=useState(false);
  const [tab,setTab]=useState("submission"),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[message,setMessage]=useState(""),[review,setReview]=useState("");
  const [leave,setLeave]=useState({kind:"PTO",start_date:"",end_date:"",hours:"",note:""});
  const seq=useRef(0);
  const admin=profile.role==="admin",leadership=["supervisor","admin"].includes(profile.role);
  const visibleSections=sections.filter(section=>section.key!=="recognition"||leadership);
  const requiredSectionKeys=visibleSections.map(section=>section.key);
  const selected=data?.submissions.find(s=>s.store_id===store);
  const locked=data?.cycle.status==="approved" || ["submitted","approved"].includes(selected?.status??"");
  async function call(body:Record<string,unknown>){
    if(!supabase)throw Error("Payroll requires a signed-in live account.");
    const {data,error}=await supabase.functions.invoke("payroll",{body:{due_date:due,...body}});
    if(error){
      let detail=data?.error;
      try{detail=detail || (await error.context?.json())?.error;}catch{}
      throw Error(detail || error.message);
    }
    if(!data?.ok)throw Error(data?.error || "Payroll request failed.");
    return data;
  }
  async function load(){
    const request=++seq.current;setLoading(true);setMessage("");
    if(!supabase){
      setData({cycle:{status:"open"},stores:[{id:"preview",name:"Example store (preview)"}],submissions:[],requests:[],emails:[],email_ready:false,preview:"The approved email will list each payroll section, then each store."});
      setStore("preview");setLoading(false);setMessage("Preview only: sign in to the live portal to save payroll or submit requests.");return;
    }
    try{const next=await call({action:"load"});if(seq.current!==request)return;setData(next);setStore(s=>next.stores.some((x:Store)=>x.id===s)?s:next.stores[0]?.id??"");}
    catch(e){if(seq.current===request){setData(null);setMessage((e as Error).message);}}
    finally{if(seq.current===request)setLoading(false);}
  }
  useEffect(()=>{void load();return()=>{seq.current++;};},[due,profile.id]);
  useEffect(()=>{setEntries((selected?.entries??[]).map(entry=>({...blank(entry.section,due),...entry,acknowledged:Boolean(entry.acknowledged)})));setConfirmed(selected?.confirmed_sections??[]);setReview(selected?.review_note??"");setDirty(false);},[store,data,due]);
  useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue="";}};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[dirty]);
  const leaveDraft=()=>!dirty || window.confirm("Discard your unsaved payroll edits?");
  async function mutate(payload:Record<string,unknown>,success:string){
    setBusy(true);setMessage("");
    try{await call(payload);setDirty(false);await load();setMessage(success);}
    catch(e){setMessage((e as Error).message);}
    finally{setBusy(false);}
  }
  async function checkEmail(){
    setBusy(true);setMessage("");
    try{const result=await call({action:"email_health"});setMessage(result.provider==="resend"?`Resend delivery is configured as ${result.sender}. Submit one test request to confirm inbox delivery.`:`Gmail connected securely as ${result.sender}. No email was sent.`);}
    catch(e){setMessage((e as Error).message);}
    finally{setBusy(false);}
  }
  function update<K extends keyof Entry>(index:number,key:K,value:Entry[K]){setEntries(es=>es.map((e,i)=>i===index?{...e,[key]:value}:e));setDirty(true);}
  function changeType(index:number,type:string){setEntries(es=>es.map((entry,i)=>i!==index?entry:{...blank(entry.section,due),type,employee:entry.employee,employee_id:entry.employee_id,effective_date:type==="Pay Rate Change"?due:""}));setDirty(true);}
  async function uploadAttachment(index:number,file:File){
    if(!supabase||!store)return;
    if(file.size>10*1024*1024){setMessage("Attachments must be 10 MB or smaller.");return;}
    setBusy(true);setMessage("");
    try{
      const signed=await call({action:"attachment_upload",store_id:store,file_name:file.name,mime_type:file.type});
      const uploaded=await supabase.storage.from("payroll-attachments").uploadToSignedUrl(signed.path,signed.token,file,{contentType:file.type||undefined});
      if(uploaded.error)throw uploaded.error;
      update(index,"attachment_path",signed.path);update(index,"attachment_name",file.name);update(index,"attachment_type",file.type);
      setMessage("Deduction form attached securely.");
    }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
  }
  async function openAttachment(entry:Entry){
    try{const result=await call({action:"attachment_download",store_id:store,path:entry.attachment_path});const link=document.createElement("a");link.href=result.signed_url;link.target="_blank";link.rel="noopener";link.click();}
    catch(e){setMessage((e as Error).message);}
  }
  function entryFields(entry:Entry,index:number){
    const notesRequired=["Additional Hours","Shift Coverage Bonus"].includes(entry.type);
    return <>
      <div className="payroll-fields">
        <label>Update type<select value={entry.type} onChange={e=>changeType(index,e.target.value)}>{sections.find(s=>s.key===entry.section)!.types.map(t=><option key={t}>{t}</option>)}</select></label>
        <label>Team member name <small>Exactly as shown in payroll</small><input value={entry.employee} onChange={e=>update(index,"employee",e.target.value)}/></label>
        {entry.type==="PTO / Vacation"&&<><label>First day taken off<input type="date" value={entry.effective_date} onChange={e=>update(index,"effective_date",e.target.value)}/></label><label>Last day taken off<input type="date" min={entry.effective_date} value={entry.end_date} onChange={e=>update(index,"end_date",e.target.value)}/></label><label>Time used<select value={entry.day_portion} onChange={e=>update(index,"day_portion",e.target.value)}><option>Full day</option><option>Half day</option></select></label></>}
        {entry.type==="Position Change / Promotion"&&<><label>New position<input value={entry.new_position} onChange={e=>update(index,"new_position",e.target.value)}/></label><label>Effective date<input type="date" value={entry.effective_date} onChange={e=>update(index,"effective_date",e.target.value)}/></label><label>New hourly rate ($)<input type="number" min="0" step=".01" value={entry.amount} onChange={e=>update(index,"amount",e.target.value)}/></label></>}
        {entry.type==="Pay Rate Change"&&<><label>Position being changed<input value={entry.position} onChange={e=>update(index,"position",e.target.value)}/></label><label>Effective pay-period start<select value={entry.effective_date||due} onChange={e=>update(index,"effective_date",e.target.value)}><option value={due}>{due} (payroll Monday)</option><option value={addDays(due,-14)}>{addDays(due,-14)} (current period start)</option></select></label><label>New hourly rate ($)<input type="number" min="0" step=".01" value={entry.amount} onChange={e=>update(index,"amount",e.target.value)}/></label></>}
        {entry.type==="Additional Hours"&&<><label>Date worked<input type="date" value={entry.effective_date} onChange={e=>update(index,"effective_date",e.target.value)}/></label><label>Hours to add <small>Decimal hours allowed, such as 2.5</small><input type="number" min=".01" step=".01" value={entry.hours} onChange={e=>update(index,"hours",e.target.value)}/></label><label>Position for the hours<input value={entry.position} onChange={e=>update(index,"position",e.target.value)}/></label></>}
        {entry.type==="Shift Coverage Bonus"&&<><label>Date bonus applies<input type="date" value={entry.effective_date} onChange={e=>update(index,"effective_date",e.target.value)}/></label><label>Bonus amount ($)<input type="number" min="0" step=".01" value={entry.amount} onChange={e=>update(index,"amount",e.target.value)}/></label></>}
        {entry.type==="Address Change"&&<label className="payroll-wide">New address<textarea value={entry.new_address} onChange={e=>update(index,"new_address",e.target.value)} placeholder="Street, city, state, ZIP"/></label>}
        {entry.type==="Legal Name Change"&&<label>New legal name<input value={entry.new_name} onChange={e=>update(index,"new_name",e.target.value)}/></label>}
        {entry.type==="Partners Foundation Payroll Deduction"&&<label>Deduction each pay period ($)<input type="number" min="0" step=".01" value={entry.amount} onChange={e=>update(index,"amount",e.target.value)}/></label>}
        {entry.section==="recognition"&&<><label>Position<input value={entry.position} onChange={e=>update(index,"position",e.target.value)}/></label><label>Effective date<input type="date" value={entry.effective_date} onChange={e=>update(index,"effective_date",e.target.value)}/></label><label>Bonus amount ($)<input type="number" min="0" step=".01" value={entry.amount} onChange={e=>update(index,"amount",e.target.value)}/></label></>}
      </div>
      {entry.type==="Legal Name Change"&&<label className="check-row payroll-attestation"><input type="checkbox" checked={entry.acknowledged} onChange={e=>update(index,"acknowledged",e.target.checked)}/><span>Legal paperwork was emailed, including the new Social Security card with the updated name.</span></label>}
      {entry.type==="Direct Deposit Update"&&<><div className="payroll-security-note"><strong>Do not enter bank account or routing information here.</strong><span>Send the new direct-deposit information through the approved secure email process.</span></div><label className="check-row payroll-attestation"><input type="checkbox" checked={entry.acknowledged} onChange={e=>update(index,"acknowledged",e.target.checked)}/><span>New direct-deposit information was emailed securely.</span></label></>}
      {entry.type==="Partners Foundation Payroll Deduction"&&<div className="payroll-attachment"><label className="button secondary">{busy?"Uploading…":"Attach form or photo"}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadAttachment(index,file);e.currentTarget.value="";}}/></label>{entry.attachment_name&&<span><strong>{entry.attachment_name}</strong><button type="button" className="link-button" onClick={()=>void openAttachment(entry)}>View</button><button type="button" className="link-button danger-text" onClick={()=>{update(index,"attachment_path","");update(index,"attachment_name","");update(index,"attachment_type","");}}>Remove</button></span>}</div>}
      <label>{notesRequired?"Notes / reason (required)":"Notes (optional)"}<textarea maxLength={2000} value={entry.details} onChange={e=>update(index,"details",e.target.value)} placeholder={notesRequired?"Explain why this payroll adjustment is needed.":"Add any helpful details for payroll."}/></label>
      {entry.type==="Pay Rate Change"&&<button type="button" className="button secondary" onClick={()=>{setEntries(es=>[...es,{...entry,position:"",amount:"",details:"",attachment_path:"",attachment_name:"",attachment_type:""}]);setDirty(true);}}>Add another position for this team member</button>}
    </>;
  }
  const counts={submitted:data?.submissions.filter(s=>["submitted","approved"].includes(s.status)).length??0,approved:data?.submissions.filter(s=>s.status==="approved").length??0};
  return <div className="page payroll-page">
    <div className="page-heading"><p className="eyebrow">Every other Monday</p><h1>Payroll Submission</h1><p>Submit by 4:00 p.m. Central. GMs with missing submissions receive a warning at 2:00 p.m. at their account email.</p></div>
    <section className="panel payroll-toolbar">
      <button className="button secondary" disabled={busy||loading} onClick={()=>{if(leaveDraft())setDue(addDays(due,-14));}}>Previous cycle</button>
      <div><strong>Due {due} · 4 p.m. Central</strong><p>Work dates: {addDays(due,-14)} – {addDays(due,-1)}</p></div>
      <button className="button secondary" disabled={busy||loading} onClick={()=>{if(leaveDraft())setDue(addDays(due,14));}}>Next cycle</button>
      <button className="button secondary" disabled={busy||loading} onClick={()=>{if(leaveDraft())void load();}}>Refresh</button>
    </section>
    {message&&<p className="inline-message" role="status">{message}</p>}
    {loading?<p>Loading payroll…</p>:data&&<>
      {!data.email_ready&&<p className="inline-message">Email delivery is not connected yet. Submissions and requests are saved, but reminders and approved payroll emails cannot be delivered until the sender is configured.</p>}
      <div className="payroll-tabs" role="tablist" aria-label="Payroll area">{[["submission","Store submission"],["review","Review & cycle status"],["leave","PTO / Vacation"]].map(([id,label])=><button role="tab" aria-selected={tab===id} className={`button ${tab===id?"primary":"secondary"}`} key={id} onClick={()=>setTab(id)}>{label}</button>)}</div>
      {tab==="submission"&&<section className="panel payroll-form">
        <label>Store<select value={store} disabled={busy} onChange={e=>{if(leaveDraft())setStore(e.target.value);}}>{data.stores.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
        {!data.stores.length?<p>No store is assigned to this account. An admin can assign stores in Team access.</p>:<>
          <p>Status: <strong>{selected?.status??"Not started"}</strong>{dirty?" · Unsaved changes":""}</p>
          {selected?.submitted_at&&<p>Submitted {new Date(selected.submitted_at).toLocaleString("en-US",{timeZone:"America/Chicago"})} Central</p>}
          {selected?.review_note&&<p className="inline-message">Review note: {selected.review_note}</p>}
          <p>Confirm every section, even when there are no changes. For direct deposit, record that the secure update was completed; do not enter bank account or routing numbers here.</p>
          {visibleSections.map(section=><fieldset key={section.key} disabled={locked||busy}>
            <legend>{section.title}</legend>
            {entries.map((entry,index)=>entry.section!==section.key?null:<div className="payroll-entry" key={index}>
              {entryFields(entry,index)}
              <button type="button" className="button secondary" onClick={()=>{setEntries(es=>es.filter((_,i)=>i!==index));setDirty(true);}}>Remove entry</button>
            </div>)}
            <button className="button secondary" onClick={()=>{setEntries(es=>[...es,blank(section.key,due)]);setDirty(true);}}>Add entry</button>
            <label className="check-row"><input type="checkbox" checked={confirmed.includes(section.key)} onChange={e=>{setConfirmed(c=>e.target.checked?[...c,section.key]:c.filter(k=>k!==section.key));setDirty(true);}}/><span>I reviewed this section; all changes are entered, or there are no changes.</span></label>
          </fieldset>)}
          {!locked&&<div className="button-row"><button className="button secondary" disabled={busy} onClick={()=>void mutate({action:"save",store_id:store,entries,confirmed_sections:leadership?confirmed:[...new Set([...confirmed,"recognition"])],status:"draft"},"Draft saved.")}>Save draft</button><button className="button primary" disabled={busy||requiredSectionKeys.some(key=>!confirmed.includes(key))} onClick={()=>void mutate({action:"save",store_id:store,entries,confirmed_sections:leadership?confirmed:[...new Set([...confirmed,"recognition"])],status:"submitted"},"Payroll submitted for review.")}>Submit payroll</button></div>}
          {admin&&data.cycle.status==="open"&&["submitted","approved"].includes(selected?.status??"")&&<div className="payroll-review"><label>Review / correction note<textarea value={review} onChange={e=>setReview(e.target.value)}/></label><div className="button-row"><button className="button secondary" disabled={busy||!review.trim()} onClick={()=>void mutate({action:"review",store_id:store,status:"returned",review_note:review},"Returned to the GM for correction.")}>Return for correction</button><button className="button primary" disabled={busy||selected?.status==="approved"} onClick={()=>void mutate({action:"review",store_id:store,status:"approved",review_note:review},"Store approved. The cycle email waits for final approval.")}>Approve store</button></div></div>}
        </>}
      </section>}
      {tab==="review"&&<section className="panel payroll-form"><h2>Cycle {data.cycle.status}</h2><p>{counts.submitted} of {data.stores.length} stores submitted · {counts.approved} approved</p>
        {data.stores.map(s=>{const sub=data.submissions.find(x=>x.store_id===s.id);return <div className="payroll-status-row" key={s.id}><strong>{s.name}</strong><span>{sub?.status??"Not submitted"}</span><button className="button secondary" onClick={()=>{if(leaveDraft()){setStore(s.id);setTab("submission");}}}>Review</button></div>;})}
        {admin&&<><div className="button-row"><button className="button secondary" disabled={busy} onClick={()=>void checkEmail()}>Check email connection</button><span>{data.email_ready?"Email sender configured":"Email sender not configured"}</span></div><details><summary>Preview combined payroll email</summary><pre className="payroll-email-preview">{data.preview}</pre></details>
          <p>Final approval locks all store submissions and queues one email to the configured payroll recipient.</p>
          <button className="button primary" disabled={busy||data.cycle.status!=="open"||!data.stores.length||counts.approved!==data.stores.length} onClick={()=>{if(window.confirm("Approve and lock this entire payroll cycle, and queue the combined payroll email?"))void mutate({action:"approve_cycle"},"Cycle approved. See email status below.");}}>Approve entire cycle & queue email</button>
          {data.emails.map(e=><p key={e.id}>{e.kind==="payroll"?"Combined payroll":"GM reminder"} → {e.recipient}: <strong>{e.status==="sent"?"Accepted by Google Gmail":e.status}</strong>{e.last_error?` — ${e.last_error}`:""}</p>)}
        </>}
      </section>}
      {tab==="leave"&&<section className="panel payroll-form"><h2>PTO / Vacation requests</h2><p>Your request appears on the Team calendar immediately as pending. Approved time off must also be included in the applicable store payroll submission. This tracks requests, not accrued leave balances.</p>
        <form onSubmit={e=>{e.preventDefault();void mutate({action:"time_off",...leave,store_id:store||null},"Request submitted and added to the Team calendar.");}}>
          <div className="payroll-fields">
            <label>Store<select value={store} onChange={e=>{if(leaveDraft())setStore(e.target.value);}}>{profile.role!=="manager"&&<option value="">Leadership / no store</option>}{data.stores.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
            <label>Type<select value={leave.kind} onChange={e=>setLeave({...leave,kind:e.target.value})}><option>PTO</option><option>Vacation</option></select></label>
            <label>First day<input required type="date" value={leave.start_date} onChange={e=>setLeave({...leave,start_date:e.target.value})}/></label>
            <label>Last day<input required type="date" min={leave.start_date} value={leave.end_date} onChange={e=>setLeave({...leave,end_date:e.target.value})}/></label>
            <label>Requested hours<input required type="number" min=".25" step=".25" value={leave.hours} onChange={e=>setLeave({...leave,hours:e.target.value})}/></label>
          </div><label>Coverage / notes<textarea maxLength={2000} value={leave.note} onChange={e=>setLeave({...leave,note:e.target.value})}/></label><button className="button primary" disabled={busy}>Submit time-off request</button>
        </form>
        {data.requests.map(r=><article className="payroll-entry" key={r.id}><h3>{r.requester_name} · {r.kind} · {r.status}</h3><p>{r.start_date} – {r.end_date} · {r.hours} hours · {data.stores.find(s=>s.id===r.store_id)?.name??"Leadership"}</p><p>{r.note}</p>{r.review_note&&<p>Review: {r.review_note}</p>}
          {r.requester_id===profile.id&&["pending","approved"].includes(r.status)&&<button disabled={busy} className="button secondary" onClick={()=>void mutate({action:"time_off_review",id:r.id,status:"cancelled"},"Request cancelled and removed from the calendar.")}>Cancel request</button>}
          {r.requester_id!==profile.id&&r.status==="pending"&&(admin||profile.role==="supervisor")&&<div className="button-row"><button disabled={busy} className="button primary" onClick={()=>void mutate({action:"time_off_review",id:r.id,status:"approved"},"Time off approved.")}>Approve request</button><button disabled={busy} className="button secondary" onClick={()=>{const note=window.prompt("Reason for declining");if(note!==null)void mutate({action:"time_off_review",id:r.id,status:"declined",review_note:note},"Request declined.");}}>Decline request</button></div>}
        </article>)}
      </section>}
    </>}
  </div>;
}
