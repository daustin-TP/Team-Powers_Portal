import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Clock3, LogOut, Send, ShieldCheck, X } from "lucide-react";
import { supabase } from "../lib/supabase";

export type MemberAccess = { id: string; display_name: string; store_id: string; store_name: string; access_email: string };
type MemberRequest = { id:string; request_kind:"one_time"|"recurring"; recurring_status:"available"|"limited"|"unavailable"; selected_dates:string[]; selected_weekdays:number[]; all_day:boolean; start_time:string; end_time:string; note:string; status:string; review_note:string; created_at:string };
type StandardAvailability = { day_of_week:number; start_time:string; end_time:string; available:boolean };
type MemberShift = { id:string; day_of_week:number; role:string; start_time:string; end_time:string };
type MemberWeek = { week_start:string; shifts:MemberShift[] };
const days=["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const dateLabel=(value:string)=>new Date(`${value}T12:00:00`).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
const timeLabel=(value:string)=>new Date(`2000-01-01T${value}`).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
const addDays=(iso:string,amount:number)=>{const d=new Date(`${iso}T12:00:00`);d.setDate(d.getDate()+amount);return d.toISOString().slice(0,10);};

export default function TeamMemberPortal({ member, onSignOut, onAccessRevoked }:{member:MemberAccess;onSignOut:()=>void;onAccessRevoked:()=>void}){
  const [requests,setRequests]=useState<MemberRequest[]>([]);
  const [weeks,setWeeks]=useState<MemberWeek[]>([]);
  const [standardAvailability,setStandardAvailability]=useState<StandardAvailability[]>([]);
  const [kind,setKind]=useState<"one_time"|"recurring">("one_time");
  const [startDate,setStartDate]=useState(new Date().toISOString().slice(0,10));
  const [endDate,setEndDate]=useState(new Date().toISOString().slice(0,10));
  const [weekdays,setWeekdays]=useState<number[]>([]);
  const [recurringStatus,setRecurringStatus]=useState<"available"|"limited"|"unavailable">("unavailable");
  const [allDay,setAllDay]=useState(true);
  const [startTime,setStartTime]=useState("10:00");
  const [endTime,setEndTime]=useState("14:00");
  const [note,setNote]=useState("");
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(true);
  const [submitting,setSubmitting]=useState(false);

  const load=useCallback(async()=>{
    if(!supabase)return;
    const {data,error:loadError}=await supabase.rpc("team_member_portal_action",{action:"dashboard",payload:{}});
    if(loadError){onAccessRevoked();return;}
    setRequests((data?.requests??[]) as MemberRequest[]);setWeeks((data?.weeks??[]) as MemberWeek[]);setStandardAvailability((data?.standard_availability??[]) as StandardAvailability[]);setLoading(false);
  },[onAccessRevoked]);
  useEffect(()=>{void load();const focus=()=>void load();window.addEventListener("focus",focus);const timer=window.setInterval(focus,15_000);return()=>{window.removeEventListener("focus",focus);window.clearInterval(timer);};},[load]);

  const selectedDates=useMemo(()=>{if(kind!=="one_time"||!startDate||!endDate||endDate<startDate)return[];const result:string[]=[];for(let day=startDate;day<=endDate&&result.length<32;day=addDays(day,1))result.push(day);return result;},[kind,startDate,endDate]);
  const submit=async()=>{
    if(!supabase)return;
    if(kind==="one_time"&&!selectedDates.length){setError("Choose a valid date or date range.");return;}
    if(kind==="recurring"&&!weekdays.length){setError("Choose at least one weekday.");return;}
    if(kind==="recurring"&&note.trim().length<5){setError("A valid reason is required for every recurring availability change.");return;}
    setSubmitting(true);setError("");setMessage("");
    const {error:submitError}=await supabase.rpc("team_member_portal_action",{action:"submit",payload:{request_kind:kind,selected_dates:selectedDates,selected_weekdays:weekdays,recurring_status:recurringStatus,all_day:allDay,start_time:startTime,end_time:endTime,note}});
    setSubmitting(false);
    if(submitError){setError(submitError.message);return;}
    setMessage("Your request was sent to your manager for review.");setNote("");setWeekdays([]);await load();
  };
  const cancel=async(id:string)=>{if(!supabase||!window.confirm("Cancel this pending request?"))return;const {error:cancelError}=await supabase.rpc("team_member_portal_action",{action:"cancel",payload:{request_id:id}});if(cancelError)setError(cancelError.message);else{setMessage("Request cancelled.");await load();}};
  const chooseRecurringDay=(day:number)=>{
    const current=standardAvailability.find(item=>item.day_of_week===day);
    setKind("recurring");setWeekdays([day]);setError("");setMessage("");
    if(!current){setRecurringStatus("available");setStartTime("10:00");setEndTime("23:00");return;}
    if(!current.available){setRecurringStatus("unavailable");return;}
    const allDay=current.start_time.slice(0,5)==="00:00"&&current.end_time.slice(0,5)==="23:59";
    setRecurringStatus(allDay?"available":"limited");
    if(!allDay){setStartTime(current.start_time.slice(0,5));setEndTime(current.end_time.slice(0,5));}
  };
  const recurringCopy=(day:number)=>{
    const current=standardAvailability.find(item=>item.day_of_week===day);
    if(!current)return {label:"Available all day",tone:"available"};
    if(!current.available)return {label:"Not available",tone:"unavailable"};
    const allDay=current.start_time.slice(0,5)==="00:00"&&current.end_time.slice(0,5)==="23:59";
    return allDay?{label:"Available all day",tone:"available"}:{label:`${timeLabel(current.start_time)}–${timeLabel(current.end_time)}`,tone:"limited"};
  };

  return <main className="member-portal">
    <header className="member-portal-header"><img src="/dash-sos-logo.png" alt="DASHos"/><div><small>TEAM MEMBER ACCESS</small><strong>{member.display_name}</strong><span>{member.store_name}</span></div><button className="button secondary compact" onClick={onSignOut}><LogOut size={16}/>Sign out</button></header>
    <section className="member-portal-hero"><div><p className="eyebrow">My schedule &amp; requests</p><h1>Everything you need, without the paperwork.</h1><p>View published shifts and send availability changes directly to your manager.</p></div><ShieldCheck size={52}/></section>
    {message&&<div className="success-banner">{message}</div>}{error&&<div className="error-banner">{error}</div>}
    <section className="panel member-recurring-overview"><div className="panel-heading"><div><p className="eyebrow">My recurring availability</p><h2>Current weekly availability</h2><p>Select any day to request a manager-approved change.</p></div><Clock3 size={25}/></div><div className="member-availability-week">{days.map((day,index)=>{const copy=recurringCopy(index);return <button type="button" className={copy.tone} key={day} onClick={()=>chooseRecurringDay(index)}><strong>{day.slice(0,3)}</strong><span>{copy.label}</span></button>;})}</div></section>
    <div className="member-portal-grid">
      <section className="panel member-schedule"><div className="panel-heading"><div><p className="eyebrow">Published schedule</p><h2>My upcoming shifts</h2></div><CalendarDays size={25}/></div>
        {loading?<p>Loading your schedule…</p>:weeks.length===0?<div className="activity-empty compact">No published shifts are available yet.</div>:weeks.map(week=><article key={week.week_start}><h3>Week of {dateLabel(week.week_start)}</h3>{week.shifts.length===0?<p className="member-off-week">No shifts assigned this week.</p>:week.shifts.map(shift=><div className="member-shift" key={shift.id}><b>{days[shift.day_of_week]}<small>{dateLabel(addDays(week.week_start,shift.day_of_week))}</small></b><span>{timeLabel(shift.start_time)}–{timeLabel(shift.end_time)}<small>{shift.role}</small></span></div>)}</article>)}
      </section>
      <section className="panel member-request-form"><div><p className="eyebrow">Request a change</p><h2>Request time off or availability</h2><p>Your manager must approve this before it changes the scheduler.</p></div>
        <div className="request-kind-toggle"><button className={kind==="one_time"?"active":""} onClick={()=>setKind("one_time")}>Specific date(s)</button><button className={kind==="recurring"?"active":""} onClick={()=>setKind("recurring")}>Repeating weekly</button></div>
        {kind==="one_time"?<div className="member-date-range"><label>First date<input type="date" min={new Date().toISOString().slice(0,10)} value={startDate} onChange={e=>{setStartDate(e.target.value);if(e.target.value>endDate)setEndDate(e.target.value);}}/></label><label>Last date<input type="date" min={startDate} value={endDate} onChange={e=>setEndDate(e.target.value)}/></label><small>{selectedDates.length} day{selectedDates.length===1?"":"s"} selected</small></div>:<><fieldset className="member-weekday-picker"><legend>Days this repeats</legend>{days.map((day,index)=><label className={weekdays.includes(index)?"selected":""} key={day}><input type="checkbox" checked={weekdays.includes(index)} onChange={e=>setWeekdays(current=>e.target.checked?[...current,index].sort():current.filter(value=>value!==index))}/>{day.slice(0,3)}</label>)}</fieldset><label>Requested availability<select value={recurringStatus} onChange={e=>setRecurringStatus(e.target.value as typeof recurringStatus)}><option value="available">Available all day</option><option value="limited">Available only during set hours</option><option value="unavailable">Not available</option></select></label><div className="recurring-reason-warning"><AlertTriangle size={18}/><strong>A valid reason is required for recurring changes.</strong><span>Examples: second job, school, after-school activity, or an ongoing family responsibility.</span></div></>}
        {kind==="one_time"&&<label className="checkbox-line"><input type="checkbox" checked={allDay} onChange={e=>setAllDay(e.target.checked)}/>Unavailable all day</label>}
        {((kind==="one_time"&&!allDay)||(kind==="recurring"&&recurringStatus==="limited"))&&<div className="availability-time-row"><label>{kind==="recurring"?"Available from":"Unavailable from"}<input type="time" step="900" value={startTime} onChange={e=>setStartTime(e.target.value)}/></label><label>Until<input type="time" step="900" value={endTime} onChange={e=>setEndTime(e.target.value)}/></label></div>}
        <label>Reason or details {kind==="one_time"?<small className="optional-label">Optional</small>:<small className="required-label">Required</small>}<textarea required={kind==="recurring"} rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder={kind==="recurring"?"Explain why this repeating change is needed":"Help your manager understand the request"}/></label>
        <button className="button primary full" disabled={submitting} onClick={()=>void submit()}><Send size={17}/>{submitting?"Sending…":"Send request"}</button>
      </section>
    </div>
    <section className="panel member-request-history"><div className="panel-heading"><div><p className="eyebrow">Request history</p><h2>Status and manager response</h2></div><Clock3 size={25}/></div>{requests.length===0?<div className="activity-empty compact">You have not submitted a request yet.</div>:requests.map(request=><article key={request.id}><div><strong>{request.request_kind==="recurring"?request.selected_weekdays.map(day=>days[day].slice(0,3)).join(", "):request.selected_dates.map(dateLabel).join(" – ")}</strong><span>{request.request_kind==="recurring"?`${request.recurring_status==="available"?"Available all day":request.recurring_status==="limited"?`Available ${timeLabel(request.start_time)}–${timeLabel(request.end_time)}`:"Not available"} · `:request.all_day?"All day · ":`${timeLabel(request.start_time)}–${timeLabel(request.end_time)} · `}submitted {dateLabel(request.created_at.slice(0,10))}</span>{request.note&&<small>{request.note}</small>}{request.review_note&&<small>Manager note: {request.review_note}</small>}</div><span className={`request-status ${request.status}`}>{request.status}</span>{request.status==="pending"&&<button className="icon-button danger" title="Cancel request" onClick={()=>void cancel(request.id)}><X size={17}/></button>}</article>)}</section>
  </main>;
}
