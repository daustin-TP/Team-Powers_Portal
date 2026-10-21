import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Profile } from "../types";
import { addDays, currentCycle, sections, type Entry } from "../../supabase/functions/payroll/model";

type Store={id:string;name:string};
type Submission={id:string;store_id:string;store_name:string;entries:Entry[];confirmed_sections:string[];status:string;review_note:string;submitted_at:string|null};
type TimeOff={id:string;requester_id:string;requester_name:string;requester_role:string;store_id:string|null;kind:string;start_date:string;end_date:string;hours:number;status:string;review_note:string;note:string};
type Data={cycle:{status:string};stores:Store[];submissions:Submission[];requests:TimeOff[];emails:{id:string;kind:string;recipient:string;status:string;last_error:string|null}[];email_ready:boolean;preview:string};
const blank=(section:string):Entry=>({section,type:sections.find(s=>s.key===section)!.types[0],employee:"",employee_id:"",effective_date:"",amount:"",hours:"",details:""});
export default function PayrollCenter({profile}:{profile:Profile}){
  const [due,setDue]=useState(currentCycle),[store,setStore]=useState(""),[data,setData]=useState<Data|null>(null);
  const [entries,setEntries]=useState<Entry[]>([]),[confirmed,setConfirmed]=useState<string[]>([]),[dirty,setDirty]=useState(false);
  const [tab,setTab]=useState("submission"),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[message,setMessage]=useState(""),[review,setReview]=useState("");
  const [leave,setLeave]=useState({kind:"PTO",start_date:"",end_date:"",hours:"",note:""});
  const seq=useRef(0);
  const admin=profile.role==="admin";
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
  useEffect(()=>{setEntries(selected?.entries??[]);setConfirmed(selected?.confirmed_sections??[]);setReview(selected?.review_note??"");setDirty(false);},[store,data]);
  useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue="";}};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[dirty]);
  const leaveDraft=()=>!dirty || window.confirm("Discard your unsaved payroll edits?");
  async function mutate(payload:Record<string,unknown>,success:string){
    setBusy(true);setMessage("");
    try{await call(payload);setDirty(false);await load();setMessage(success);}
    catch(e){setMessage((e as Error).message);}
    finally{setBusy(false);}
  }
  function update(index:number,key:keyof Entry,value:string){setEntries(es=>es.map((e,i)=>i===index?{...e,[key]:value}:e));setDirty(true);}
  const counts={submitted:data?.submissions.filter(s=>["submitted","approved"].includes(s.status)).length??0,approved:data?.submissions.filter(s=>s.status==="approved").length??0};
  return <div className="page payroll-page">
    <div className="page-heading"><p className="eyebrow">Every other Monday</p><h1>Payroll</h1><p>Submit by 4:00 p.m. Central. GMs with missing submissions receive a warning at 2:00 p.m. at their account email.</p></div>
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
          {sections.map(section=><fieldset key={section.key} disabled={locked||busy}>
            <legend>{section.title}</legend>
            {entries.map((entry,index)=>entry.section!==section.key?null:<div className="payroll-entry" key={index}>
              <div className="payroll-fields">
                <label>Update type<select value={entry.type} onChange={e=>update(index,"type",e.target.value)}>{section.types.map(t=><option key={t}>{t}</option>)}</select></label>
                <label>Employee payroll name<input value={entry.employee} onChange={e=>update(index,"employee",e.target.value)}/></label>
                <label>Employee ID (optional)<input value={entry.employee_id} onChange={e=>update(index,"employee_id",e.target.value)}/></label>
                <label>Effective date<input type="date" value={entry.effective_date} onChange={e=>update(index,"effective_date",e.target.value)}/></label>
                <label>Amount / hourly rate ($)<input type="number" min="0" step=".01" value={entry.amount} onChange={e=>update(index,"amount",e.target.value)}/></label>
                <label>Hours (if applicable)<input type="number" min="0" step=".25" value={entry.hours} onChange={e=>update(index,"hours",e.target.value)}/></label>
              </div>
              <label>Change details<textarea maxLength={2000} value={entry.details} onChange={e=>update(index,"details",e.target.value)} placeholder={entry.type==="Direct Deposit Update"?"Confirm secure update completion; do not enter banking details.":"Include old/new position or rate, applicable dates, and explanation."}/></label>
              <button type="button" className="button secondary" onClick={()=>{setEntries(es=>es.filter((_,i)=>i!==index));setDirty(true);}}>Remove entry</button>
            </div>)}
            <button className="button secondary" onClick={()=>{setEntries(es=>[...es,blank(section.key)]);setDirty(true);}}>Add entry</button>
            <label className="check-row"><input type="checkbox" checked={confirmed.includes(section.key)} onChange={e=>{setConfirmed(c=>e.target.checked?[...c,section.key]:c.filter(k=>k!==section.key));setDirty(true);}}/><span>I reviewed this section; all changes are entered, or there are no changes.</span></label>
          </fieldset>)}
          {!locked&&<div className="button-row"><button className="button secondary" disabled={busy} onClick={()=>void mutate({action:"save",store_id:store,entries,confirmed_sections:confirmed,status:"draft"},"Draft saved.")}>Save draft</button><button className="button primary" disabled={busy||confirmed.length!==4} onClick={()=>void mutate({action:"save",store_id:store,entries,confirmed_sections:confirmed,status:"submitted"},"Payroll submitted for review.")}>Submit payroll</button></div>}
          {admin&&data.cycle.status==="open"&&["submitted","approved"].includes(selected?.status??"")&&<div className="payroll-review"><label>Review / correction note<textarea value={review} onChange={e=>setReview(e.target.value)}/></label><div className="button-row"><button className="button secondary" disabled={busy||!review.trim()} onClick={()=>void mutate({action:"review",store_id:store,status:"returned",review_note:review},"Returned to the GM for correction.")}>Return for correction</button><button className="button primary" disabled={busy||selected?.status==="approved"} onClick={()=>void mutate({action:"review",store_id:store,status:"approved",review_note:review},"Store approved. The cycle email waits for final approval.")}>Approve store</button></div></div>}
        </>}
      </section>}
      {tab==="review"&&<section className="panel payroll-form"><h2>Cycle {data.cycle.status}</h2><p>{counts.submitted} of {data.stores.length} stores submitted · {counts.approved} approved</p>
        {data.stores.map(s=>{const sub=data.submissions.find(x=>x.store_id===s.id);return <div className="payroll-status-row" key={s.id}><strong>{s.name}</strong><span>{sub?.status??"Not submitted"}</span><button className="button secondary" onClick={()=>{if(leaveDraft()){setStore(s.id);setTab("submission");}}}>Review</button></div>;})}
        {admin&&<><details><summary>Preview combined payroll email</summary><pre className="payroll-email-preview">{data.preview}</pre></details>
          <p>Final approval locks all store submissions and queues one email to the configured payroll recipient.</p>
          <button className="button primary" disabled={busy||data.cycle.status!=="open"||!data.stores.length||counts.approved!==data.stores.length} onClick={()=>{if(window.confirm("Approve and lock this entire payroll cycle, and queue the combined payroll email?"))void mutate({action:"approve_cycle"},"Cycle approved. See email status below.");}}>Approve entire cycle & queue email</button>
          {data.emails.map(e=><p key={e.id}>{e.kind==="payroll"?"Combined payroll":"GM reminder"} → {e.recipient}: <strong>{e.status==="sent"?"Accepted by email provider":e.status}</strong>{e.last_error?` — ${e.last_error}`:""}</p>)}
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
