import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarCheck, CheckCircle2, ClipboardCheck, Clock3, Plus, Printer, Save, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { evaluationWindow } from "../lib/evaluationSchedule";
import type { Profile } from "../types";
import "./team-evaluations-fix.css";

type Store = { id: string; name: string; store_number: string | null };
type Member = { id: string; store_id: string; display_name: string; active: boolean };
type Details = { member_id: string; store_id: string; hire_date: string | null; rehire_date: string | null; evaluation_anniversary: string | null };
type Position = { id: string; member_id: string; position_name: string; hourly_rate: number | null; effective_date: string };
type Rating = 1 | 2 | 3 | null;
type WageReview = { position_id: string; position_name: string; current_rate: number | null; proposed_rate: string };
type Evaluation = {
  id: string; store_id: string; member_id: string; evaluation_type: "90_day" | "annual" | "30_day_follow_up" | "other";
  due_date: string; evaluation_date: string | null; status: "draft" | "completed"; evaluator_id: string; evaluator_name: string;
  attendance_absences: number; attendance_tardies: number; competency_ratings: Record<string, Rating>; total_score: number | null;
  manager_notes: string; development_goals: string; next_evaluation_type: "30_day_follow_up" | "annual" | "none" | null;
  next_evaluation_date: string | null; wage_review: WageReview[]; include_wage_on_print: boolean; completed_at: string | null; updated_at: string;
};
type DueCandidate = { member: Member; dueDate: string; type: Evaluation["evaluation_type"] };

const competencies = [
  ["job_knowledge", "Job knowledge"], ["quality", "Quality of work"], ["productivity", "Productivity"],
  ["attendance", "Attendance and punctuality"], ["reliability", "Reliability"], ["communication", "Communication"],
  ["teamwork", "Teamwork"], ["customer_service", "Customer service"], ["initiative", "Initiative"],
  ["safety", "Safety and procedures"], ["adaptability", "Adaptability"], ["leadership", "Leadership / ownership"],
] as const;
const typeLabels: Record<Evaluation["evaluation_type"], string> = { "90_day": "90-day", annual: "Annual", "30_day_follow_up": "30-day follow-up", other: "Other" };

function iso(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function fromIso(value: string) { return new Date(`${value}T12:00:00`); }
function addDays(value: string, days: number) { const date = fromIso(value); date.setDate(date.getDate() + days); return iso(date); }
function formatDate(value: string | null) { return value ? fromIso(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"; }
function storeLabel(store?: Store) { return store ? `${store.name}${store.store_number ? ` ${store.store_number}` : ""}` : "Store"; }
function annualDate(source: string, year: number) { const [, month, day] = source.split("-"); return `${year}-${month}-${day}`; }
function scoreLabel(score: number | null) { if (score == null) return "Not scored"; if (score >= 30) return "Exceeds expectations"; if (score >= 22) return "Meets expectations"; return "Needs improvement"; }

function blankEvaluation(profile: Profile, candidate: DueCandidate, positions: Position[]): Omit<Evaluation, "id" | "updated_at"> {
  return {
    store_id: candidate.member.store_id, member_id: candidate.member.id, evaluation_type: candidate.type, due_date: candidate.dueDate,
    evaluation_date: iso(new Date()), status: "draft", evaluator_id: profile.id, evaluator_name: profile.fullName,
    attendance_absences: 0, attendance_tardies: 0, competency_ratings: {}, total_score: null, manager_notes: "", development_goals: "",
    next_evaluation_type: candidate.type === "90_day" ? "annual" : "annual", next_evaluation_date: null,
    wage_review: positions.map((position) => ({ position_id: position.id, position_name: position.position_name, current_rate: position.hourly_rate, proposed_rate: "" })),
    include_wage_on_print: false, completed_at: null,
  };
}

export default function TeamEvaluations({ profile }: { profile: Profile }) {
  const [stores, setStores] = useState<Store[]>([]), [storeId, setStoreId] = useState("");
  const [members, setMembers] = useState<Member[]>([]), [details, setDetails] = useState<Details[]>([]), [positions, setPositions] = useState<Position[]>([]), [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [selected, setSelected] = useState<Evaluation | null>(null), [loading, setLoading] = useState(true), [saving, setSaving] = useState(false), [message, setMessage] = useState("");
  const today = useMemo(() => iso(new Date()), []);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const [storeResult, memberResult, detailResult, positionResult, evaluationResult] = await Promise.all([
      supabase.from("stores").select("id,name,store_number").eq("active", true).order("name"),
      supabase.from("labor_team_members").select("id,store_id,display_name,active").eq("active", true).order("display_name"),
      supabase.from("team_member_private_details").select("member_id,store_id,hire_date,rehire_date,evaluation_anniversary"),
      supabase.from("team_member_positions").select("id,member_id,position_name,hourly_rate,effective_date").eq("active", true).order("position_name"),
      supabase.from("team_evaluations").select("id,store_id,member_id,evaluation_type,due_date,evaluation_date,status,evaluator_id,evaluator_name,attendance_absences,attendance_tardies,competency_ratings,total_score,manager_notes,development_goals,next_evaluation_type,next_evaluation_date,wage_review,include_wage_on_print,completed_at,updated_at").order("due_date", { ascending: false }),
    ]);
    const error = storeResult.error || memberResult.error || detailResult.error || positionResult.error || evaluationResult.error;
    if (error) setMessage(error.message);
    setStores((storeResult.data ?? []) as Store[]); setMembers((memberResult.data ?? []) as Member[]); setDetails((detailResult.data ?? []) as Details[]); setPositions((positionResult.data ?? []) as Position[]); setEvaluations((evaluationResult.data ?? []) as Evaluation[]);
    setStoreId((current) => current || storeResult.data?.find((store) => store.id === profile.storeId)?.id || storeResult.data?.[0]?.id || "");
    setLoading(false);
  }, [profile.storeId]);
  useEffect(() => { void load(); }, [load]);

  const dueCandidates = useMemo(() => members.flatMap((member): DueCandidate[] => {
    const detail = details.find((item) => item.member_id === member.id);
    const employmentDate = detail?.rehire_date || detail?.hire_date;
    const evaluationStartDate = detail?.evaluation_anniversary || employmentDate;
    if (!evaluationStartDate) return [];
    const ninetyDay = addDays(evaluationStartDate, 90);
    const anniversarySource = evaluationStartDate;
    const yearsEmployed = fromIso(today).getFullYear() - fromIso(evaluationStartDate).getFullYear();
    const completedNinetyDay = evaluations.some((item) => item.member_id === member.id && item.evaluation_type === "90_day" && item.status === "completed");
    let type: Evaluation["evaluation_type"] = yearsEmployed < 1 && !completedNinetyDay ? "90_day" : "annual";
    let dueDate = type === "90_day" ? ninetyDay : annualDate(anniversarySource, fromIso(today).getFullYear());
    const latestCompleted = evaluations.filter((item) => item.member_id === member.id && item.status === "completed").sort((a, b) => (b.evaluation_date ?? b.due_date).localeCompare(a.evaluation_date ?? a.due_date))[0];
    if (latestCompleted?.next_evaluation_date) { dueDate = latestCompleted.next_evaluation_date; type = latestCompleted.next_evaluation_type === "30_day_follow_up" ? "30_day_follow_up" : "annual"; }
    else if (type === "annual" && dueDate < today && latestCompleted?.evaluation_type === "annual" && (latestCompleted.evaluation_date ?? latestCompleted.due_date) >= dueDate) dueDate = annualDate(anniversarySource, fromIso(today).getFullYear() + 1);
    return [{ member, dueDate, type }];
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [details, evaluations, members, today]);

  const filteredMembers = members.filter((item) => !storeId || item.store_id === storeId);
  const filteredEvaluations = evaluations.filter((item) => !storeId || item.store_id === storeId);
  const filteredDue = dueCandidates.filter((item) => evaluationWindow(item.dueDate, today).status !== "upcoming" && (!storeId || item.member.store_id === storeId) && !evaluations.some((evaluation) => evaluation.member_id === item.member.id && evaluation.due_date === item.dueDate));
  const overdueDrafts = filteredEvaluations.filter((item) => item.status === "draft" && evaluationWindow(item.due_date, today).status === "past_due");
  const overdueCount = filteredDue.filter((item) => evaluationWindow(item.dueDate, today).status === "past_due").length + overdueDrafts.length;
  const score = selected ? Object.values(selected.competency_ratings).reduce<number>((sum, value) => sum + (value ?? 0), 0) : 0;
  const ratingsComplete = selected ? competencies.every(([key]) => selected.competency_ratings[key] != null) : false;
  const selectedMember = selected ? members.find((item) => item.id === selected.member_id) : undefined;
  const selectedStore = selected ? stores.find((item) => item.id === selected.store_id) : undefined;

  const beginEvaluation = (candidate: DueCandidate) => {
    const draft = blankEvaluation(profile, candidate, positions.filter((item) => item.member_id === candidate.member.id));
    setSelected({ ...draft, id: "", updated_at: new Date().toISOString() }); setMessage("");
  };
  const openExisting = (evaluation: Evaluation) => setSelected({ ...evaluation, wage_review: evaluation.wage_review ?? [], competency_ratings: evaluation.competency_ratings ?? {} });
  const update = <K extends keyof Evaluation>(key: K, value: Evaluation[K]) => setSelected((current) => current ? { ...current, [key]: value } : current);
  const save = async (complete = false) => {
    if (!supabase || !selected) return;
    if (complete && !ratingsComplete) { setMessage("Rate every competency before completing the evaluation. Save it as a draft if you are not finished."); return; }
    setSaving(true); setMessage("");
    const payload = { ...selected, total_score: score || null, status: complete ? "completed" : selected.status, completed_at: complete ? new Date().toISOString() : selected.completed_at, evaluation_date: selected.evaluation_date || today, updated_by: profile.id };
    delete (payload as Partial<Evaluation>).id; delete (payload as Partial<Evaluation>).updated_at;
    const result = selected.id ? await supabase.from("team_evaluations").update(payload).eq("id", selected.id).select("*").single() : await supabase.from("team_evaluations").insert({ ...payload, created_by: profile.id }).select("*").single();
    setSaving(false);
    if (result.error) { setMessage(result.error.message); return; }
    const saved = result.data as Evaluation; setSelected(saved); setEvaluations((current) => [saved, ...current.filter((item) => item.id !== saved.id)]); setMessage(complete ? "Evaluation completed and preserved in the employee history." : "Evaluation draft saved.");
  };
  const printEvaluation = () => {
    if (!selected) return;
    const source = document.querySelector<HTMLElement>(".evaluation-print-sheet");
    if (!source) return;
    const printPortal = document.createElement("div");
    printPortal.className = "evaluation-print-portal";
    printPortal.appendChild(source.cloneNode(true));
    const pageStyle = document.createElement("style");
    pageStyle.dataset.evaluationPrintPage = "true";
    pageStyle.textContent = "@page { size: letter portrait; margin: 0.35in; }";
    document.body.appendChild(printPortal);
    document.head.appendChild(pageStyle);
    document.body.classList.add("printing-team-evaluation");
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      document.body.classList.remove("printing-team-evaluation");
      printPortal.remove();
      pageStyle.remove();
    };
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 60000);
  };

  return <div className="page evaluations-page">
    <div className="page-heading evaluations-heading"><div><p className="eyebrow">Employee growth and accountability</p><h1>Team Evaluations</h1><p>Reviews become available 14 days before the qualifying date and are due within 7 days afterward. Save drafts, complete reviews, and print a clear one-page employee copy.</p></div><label>Store<select value={storeId} onChange={(event) => setStoreId(event.target.value)}>{stores.map((store) => <option key={store.id} value={store.id}>{storeLabel(store)}</option>)}</select></label></div>
    {message && <p className="inline-message">{message}</p>}
    {loading ? <section className="panel activity-empty">Loading evaluation calendar…</section> : <>
      <section className="evaluation-summary-grid"><article className="panel"><Clock3/><span><strong>{overdueCount}</strong> past due</span></article><article className="panel"><CalendarCheck/><span><strong>{filteredDue.filter((item) => item.dueDate.slice(0,7) === today.slice(0,7)).length}</strong> qualifying this month</span></article><article className="panel"><ClipboardCheck/><span><strong>{filteredEvaluations.filter((item) => item.status === "draft").length}</strong> drafts</span></article><article className="panel"><CheckCircle2/><span><strong>{filteredEvaluations.filter((item) => item.status === "completed").length}</strong> completed</span></article><article className="panel missing-dates"><CalendarCheck/><span><strong>{filteredMembers.filter((member) => !details.find((item) => item.member_id === member.id)?.hire_date).length}</strong> hire dates to add later</span></article></section>
      <div className="evaluation-layout"><section className="panel evaluation-due-panel"><div className="table-toolbar"><div><p className="eyebrow">Automatic due list</p><h2>Available employee reviews</h2><p>Reviews appear 14 days early and become past due after the 7-day completion window.</p></div></div>{filteredDue.length === 0 ? <div className="activity-empty">No evaluations are currently available for this store.</div> : filteredDue.map((candidate) => { const timing=evaluationWindow(candidate.dueDate,today); return <div className={`evaluation-due-row ${timing.status === "past_due" ? "overdue" : timing.status}`} key={`${candidate.member.id}-${candidate.dueDate}`}><div><strong>{candidate.member.display_name}</strong><small>{typeLabels[candidate.type]} · qualifying {formatDate(candidate.dueDate)} · due by {formatDate(timing.deadlineDate)}</small></div><button className="button secondary" onClick={() => beginEvaluation(candidate)}><Plus size={15}/>Start</button></div>; })}</section>
      <section className="panel evaluation-history-panel"><div className="table-toolbar"><div><p className="eyebrow">Permanent history</p><h2>Draft and completed evaluations</h2></div></div>{filteredEvaluations.length === 0 ? <div className="activity-empty">No evaluations have been started for this store.</div> : <div className="responsive-table"><table><thead><tr><th>Employee</th><th>Type</th><th>Qualifying date</th><th>Status</th><th>Score</th><th>Evaluator</th></tr></thead><tbody>{filteredEvaluations.map((evaluation) => { const isPastDue=evaluation.status === "draft" && evaluationWindow(evaluation.due_date,today).status === "past_due"; return <tr key={evaluation.id} onClick={() => openExisting(evaluation)}><td><strong>{filteredMembers.find((item) => item.id === evaluation.member_id)?.display_name ?? "Employee"}</strong></td><td>{typeLabels[evaluation.evaluation_type]}</td><td>{formatDate(evaluation.due_date)}</td><td><span className={`status-pill ${isPastDue ? "overdue" : evaluation.status}`}>{isPastDue ? "past due" : evaluation.status}</span></td><td>{evaluation.total_score ?? "—"}</td><td>{evaluation.evaluator_name}</td></tr>; })}</tbody></table></div>}</section></div>
    </>}

    {selected && <div className="modal-backdrop evaluation-modal-backdrop" onClick={() => setSelected(null)}><section className="ticket-modal evaluation-editor" onClick={(event) => event.stopPropagation()}><button type="button" className="icon-button modal-close" onClick={() => setSelected(null)}><X/></button><div className="evaluation-editor-heading"><div><p className="eyebrow">{selected.id ? "Employee evaluation" : "New evaluation"}</p><h2>{selectedMember?.display_name}</h2><p>{storeLabel(selectedStore)} · {typeLabels[selected.evaluation_type]} · qualifying {formatDate(selected.due_date)} · due by {formatDate(evaluationWindow(selected.due_date,today).deadlineDate)}</p></div><div className="evaluation-score"><strong>{score || "—"}</strong><span>{scoreLabel(score || null)}</span></div></div>
      <div className="evaluation-form-row"><label>Evaluation date<input type="date" value={selected.evaluation_date ?? ""} onChange={(event) => update("evaluation_date", event.target.value)} /></label><label>Evaluation type<select value={selected.evaluation_type} onChange={(event) => update("evaluation_type", event.target.value as Evaluation["evaluation_type"])}>{Object.entries(typeLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Absences<input type="number" min="0" value={selected.attendance_absences} onChange={(event) => update("attendance_absences", Number(event.target.value))} /></label><label>Tardies<input type="number" min="0" value={selected.attendance_tardies} onChange={(event) => update("attendance_tardies", Number(event.target.value))} /></label></div>
      <div className="evaluation-rating-key"><span><b>3</b> Exceeds</span><span><b>2</b> Meets</span><span><b>1</b> Needs improvement</span><span><b>N/A</b> Not applicable</span></div>
      <div className="evaluation-competencies">{competencies.map(([key,label]) => <div key={key}><strong>{label}</strong><div>{([3,2,1] as const).map((rating) => <label key={rating}><input type="radio" name={key} checked={selected.competency_ratings[key] === rating} onChange={() => update("competency_ratings", { ...selected.competency_ratings, [key]: rating })}/><span>{rating}</span></label>)}<label><input type="radio" name={key} checked={selected.competency_ratings[key] === null && key in selected.competency_ratings} onChange={() => update("competency_ratings", { ...selected.competency_ratings, [key]: null })}/><span>N/A</span></label></div></div>)}</div>
      <div className="evaluation-notes-grid"><label>Manager notes<textarea rows={4} value={selected.manager_notes} onChange={(event) => update("manager_notes", event.target.value)} /></label><label>Development goals<textarea rows={4} value={selected.development_goals} onChange={(event) => update("development_goals", event.target.value)} /></label></div>
      {selected.wage_review.length > 0 && <section className="evaluation-wage-review"><div><h3>Position-specific wage review</h3><label className="checkbox-line"><input type="checkbox" checked={selected.include_wage_on_print} onChange={(event) => update("include_wage_on_print", event.target.checked)}/>Include wages on printed employee copy</label></div>{selected.wage_review.map((wage,index) => <div className="evaluation-wage-row" key={wage.position_id}><strong>{wage.position_name}</strong><span>Current {wage.current_rate == null ? "not entered" : `$${Number(wage.current_rate).toFixed(2)}`}</span><label>Proposed<input type="number" min="0" step="0.01" value={wage.proposed_rate} onChange={(event) => update("wage_review", selected.wage_review.map((item,itemIndex) => itemIndex === index ? { ...item, proposed_rate: event.target.value } : item))}/></label></div>)}</section>}
      <div className="evaluation-form-row next-review"><label>Next review<select value={selected.next_evaluation_type ?? "none"} onChange={(event) => update("next_evaluation_type", event.target.value as Evaluation["next_evaluation_type"])}><option value="annual">Annual</option><option value="30_day_follow_up">30-day follow-up</option><option value="none">None</option></select></label><label>Next review date<input type="date" value={selected.next_evaluation_date ?? ""} onChange={(event) => update("next_evaluation_date", event.target.value || null)} /></label></div>
      <div className="calendar-editor-actions"><button type="button" className="button secondary" onClick={printEvaluation}><Printer size={16}/>Print employee copy</button><button type="button" className="button secondary" disabled={saving} onClick={() => void save(false)}><Save size={16}/>Save draft</button><button type="button" className="button primary" disabled={saving} onClick={() => void save(true)}><CheckCircle2 size={16}/>{saving ? "Saving…" : "Complete evaluation"}</button></div></section></div>}

    {selected && <section className="evaluation-print-sheet" aria-hidden="true"><header><div><p>TEAM POWERS</p><h1>Employee Performance Evaluation</h1></div><span>{typeLabels[selected.evaluation_type]}</span></header><div className="evaluation-print-meta"><p><b>Employee</b>{selectedMember?.display_name}</p><p><b>Store</b>{storeLabel(selectedStore)}</p><p><b>Hire date</b>{formatDate(details.find((item) => item.member_id === selected.member_id)?.hire_date ?? null)}</p><p><b>Evaluation date</b>{formatDate(selected.evaluation_date)}</p><p><b>Evaluator</b>{selected.evaluator_name}</p><p><b>Attendance</b>{selected.attendance_absences} absence(s) · {selected.attendance_tardies} tardy</p></div><table><thead><tr><th>Performance area</th><th>Rating</th><th>Performance area</th><th>Rating</th></tr></thead><tbody>{Array.from({length:6},(_,index) => { const left = competencies[index]; const right = competencies[index+6]; return <tr key={left[0]}><td>{left[1]}</td><td>{selected.competency_ratings[left[0]] ?? "N/A"}</td><td>{right[1]}</td><td>{selected.competency_ratings[right[0]] ?? "N/A"}</td></tr>; })}</tbody></table><div className="evaluation-print-score"><b>Total score: {score}</b><span>{scoreLabel(score)}</span><small>30–36 Exceeds · 22–29 Meets · 12–21 Needs improvement</small></div><div className="evaluation-print-notes"><section><b>Manager notes</b><p>{selected.manager_notes || "—"}</p></section><section><b>Development goals</b><p>{selected.development_goals || "—"}</p></section></div>{selected.include_wage_on_print && selected.wage_review.length > 0 && <div className="evaluation-print-wages"><b>Wage review</b>{selected.wage_review.map((item) => <span key={item.position_id}>{item.position_name}: {item.current_rate == null ? "—" : `$${Number(item.current_rate).toFixed(2)}`} → {item.proposed_rate ? `$${Number(item.proposed_rate).toFixed(2)}` : "No change"}</span>)}</div>}<footer><p>Employee signature <span/></p><p>Date <span/></p><p>Manager signature <span/></p><p>Date <span/></p><small>Signature confirms receipt and discussion of this evaluation, not necessarily agreement.</small></footer></section>}
  </div>;
}
