import { FormEvent, useEffect, useMemo, useState } from "react";
import { BarChart3, Building2, CheckCircle2, RefreshCw, Save, Store, Target, Trophy, Users } from "lucide-react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import type { Profile } from "../types";

type KpiMetric = { trajectory: string; suggested_goal: string; supervisor_goal: number | null; actual: string; final_goal: string; status: string };
type Commitment = {
  row_number: number; week_end: string; store: string;
  sales: { model_projection: string; recommended_goal: string; supervisor_goal: number | null; actual: string; final_goal: string; variance: string; variance_percent: string; status: string };
  accountability: { focus_area: string; action_plan: string; owner: string };
  labor: KpiMetric; splh: KpiMetric; food_variance: KpiMetric; load: KpiMetric; adt: KpiMetric;
  extreme_orders: { actual: string; status: string }; overall_status: string;
};
type SupervisorGroup = { id: string; name: string; stores: string[] };
type KpiAccess = { canEdit: boolean; canViewAll: boolean; editableStores: string[] | null; assignedStores: string[]; supervisorGroups: SupervisorGroup[] };
type ViewLevel = "company" | "supervisor" | "store";
type Draft = { supervisor_sales_goal: string; focus_area: string; action_plan: string; owner: string; supervisor_labor_goal: string; supervisor_splh_goal: string; supervisor_food_variance_goal: string; supervisor_load_goal: string; supervisor_adt_goal: string };

const focusAreas = ["Sales", "Labor", "Food", "Service", "Staffing", "Marketing", "Operations"];

function nextSunday() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + ((7 - date.getDay()) % 7));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function demoMetric(trajectory: string, suggested: string, supervisor: number): KpiMetric {
  return { trajectory, suggested_goal: suggested, supervisor_goal: supervisor, actual: "Pending", final_goal: suggested, status: "Pending" };
}
const demoCommitments: Commitment[] = [
  { row_number: 4, week_end: nextSunday(), store: "1412", sales: { model_projection: "$37,381", recommended_goal: "$38,100", supervisor_goal: 39000, actual: "$39,420", final_goal: "$39,000", variance: "$420", variance_percent: "1.1%", status: "Yes" }, accountability: { focus_area: "Sales", action_plan: "Build Friday dinner staffing and confirm school-event outreach.", owner: "Store leadership" }, labor: { ...demoMetric("23.8%", "23.4%", 0.232), actual: "23.1%", status: "Yes" }, splh: { ...demoMetric("$55.24", "$56.43", 57), actual: "$57.18", status: "Yes" }, food_variance: { ...demoMetric("1.7%", "1.5%", 0.015), actual: "1.6%", status: "No" }, load: { ...demoMetric("3.7", "3.7", 3.5), actual: "3.4", status: "Yes" }, adt: { ...demoMetric("21.2", "21.1", 21), actual: "20.8", status: "Yes" }, extreme_orders: { actual: "4", status: "Yes" }, overall_status: "Goals Met" },
  { row_number: 5, week_end: nextSunday(), store: "1633", sales: { model_projection: "$31,200", recommended_goal: "$31,700", supervisor_goal: 32000, actual: "$31,810", final_goal: "$32,000", variance: "-$190", variance_percent: "-0.6%", status: "No" }, accountability: { focus_area: "Service", action_plan: "Coach peak-hour load and oven flow.", owner: "GM" }, labor: { ...demoMetric("24.5%", "24.0%", 0.24), actual: "24.2%", status: "No" }, splh: { ...demoMetric("$51.30", "$52.10", 53), actual: "$52.42", status: "No" }, food_variance: { ...demoMetric("1.9%", "1.6%", 0.016), actual: "1.5%", status: "Yes" }, load: { ...demoMetric("4.1", "3.9", 3.8), actual: "3.8", status: "Yes" }, adt: { ...demoMetric("22.5", "22.0", 21.8), actual: "21.7", status: "Yes" }, extreme_orders: { actual: "7", status: "No" }, overall_status: "Needs Follow Up" },
];
function emptyDraft(): Draft { return { supervisor_sales_goal: "", focus_area: "", action_plan: "", owner: "", supervisor_labor_goal: "", supervisor_splh_goal: "", supervisor_food_variance_goal: "", supervisor_load_goal: "", supervisor_adt_goal: "" }; }
function draftFromCommitment(item: Commitment): Draft {
  const value = (input: number | null) => input === null ? "" : String(input);
  return { supervisor_sales_goal: value(item.sales.supervisor_goal), focus_area: item.accountability.focus_area, action_plan: item.accountability.action_plan, owner: item.accountability.owner, supervisor_labor_goal: value(item.labor.supervisor_goal), supervisor_splh_goal: value(item.splh.supervisor_goal), supervisor_food_variance_goal: value(item.food_variance.supervisor_goal), supervisor_load_goal: value(item.load.supervisor_goal), supervisor_adt_goal: value(item.adt.supervisor_goal) };
}
function score(item: Commitment) {
  const statuses = [item.sales.status, item.labor.status, item.splh.status, item.food_variance.status, item.load.status, item.adt.status];
  const resolved = statuses.filter((status) => !["", "pending", "—"].includes(status.toLowerCase()));
  const hits = resolved.filter((status) => ["yes", "met", "goals met", "on track"].includes(status.toLowerCase())).length;
  return { hits, total: resolved.length, percent: resolved.length ? Math.round((hits / resolved.length) * 100) : null };
}
function ordered(items: Commitment[]) { return [...items].sort((a, b) => (score(b).percent ?? -1) - (score(a).percent ?? -1)); }

export default function KPITracker({ profile }: { profile: Profile }) {
  const [weekEnd, setWeekEnd] = useState(nextSunday());
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [selectedStore, setSelectedStore] = useState("");
  const [selectedSupervisor, setSelectedSupervisor] = useState("");
  const [viewLevel, setViewLevel] = useState<ViewLevel>("store");
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [access, setAccess] = useState<KpiAccess>({ canEdit: profile.role === "supervisor" || profile.role === "admin", canViewAll: profile.role === "supervisor" || profile.role === "admin", editableStores: profile.role === "admin" ? null : [], assignedStores: profile.location ? [profile.location] : [], supervisorGroups: [] });

  const selected = useMemo(() => commitments.find((item) => item.store === selectedStore) ?? commitments[0], [commitments, selectedStore]);
  const selectedGroup = access.supervisorGroups.find((group) => group.id === selectedSupervisor) ?? access.supervisorGroups[0];
  const scopedCommitments = useMemo(() => {
    if (viewLevel === "supervisor" && selectedGroup) return commitments.filter((item) => selectedGroup.stores.includes(item.store));
    if (viewLevel === "store" && selected) return [selected];
    return commitments;
  }, [commitments, selected, selectedGroup, viewLevel]);
  const canEditSelected = Boolean(selected && access.canEdit && (access.editableStores === null || access.editableStores.includes(selected.store)));

  const load = async () => {
    setLoading(true); setError(""); setMessage("");
    if (!isSupabaseConfigured || !supabase) {
      const demo = demoCommitments.map((item) => ({ ...item, week_end: weekEnd }));
      setCommitments(demo); setSelectedStore(demo[0]?.store ?? "");
      setAccess((current) => ({ ...current, supervisorGroups: [{ id: "demo-supervisor", name: "North Area", stores: demo.map((item) => item.store) }] }));
      setViewLevel("company"); setLoading(false); return;
    }
    const { data, error: invokeError } = await supabase.functions.invoke("kpi-bridge", { body: { action: "get_commitments", week_end: weekEnd } });
    if (invokeError || !data?.ok) { setError(data?.error || invokeError?.message || "The KPI data could not be loaded."); setCommitments([]); setLoading(false); return; }
    const rows = (data.result ?? []) as Commitment[];
    const nextAccess: KpiAccess = { canEdit: Boolean(data.access?.can_edit), canViewAll: Boolean(data.access?.can_view_all), editableStores: data.access?.editable_stores === null ? null : (data.access?.editable_stores ?? []), assignedStores: data.access?.assigned_stores ?? [], supervisorGroups: data.access?.supervisor_groups ?? [] };
    setCommitments(rows); setAccess(nextAccess);
    setViewLevel((current) => nextAccess.canViewAll ? (current === "store" ? "company" : current) : "store");
    setSelectedStore((current) => rows.some((item) => item.store === current) ? current : rows[0]?.store ?? "");
    setSelectedSupervisor((current) => nextAccess.supervisorGroups.some((group) => group.id === current) ? current : nextAccess.supervisorGroups[0]?.id ?? "");
    setLoading(false);
  };
  useEffect(() => { void load(); }, [weekEnd]);
  useEffect(() => { setDraft(selected ? draftFromCommitment(selected) : emptyDraft()); }, [selected]);

  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!selected || !canEditSelected) return;
    setSaving(true); setError(""); setMessage("");
    if (!isSupabaseConfigured || !supabase) { setMessage("Demo commitment saved locally."); setSaving(false); return; }
    const numeric = (value: string) => value.trim() === "" ? null : Number(value);
    const { data, error: invokeError } = await supabase.functions.invoke("kpi-bridge", { body: { action: "update_commitment", week_end: weekEnd, store: selected.store, changes: { supervisor_sales_goal: numeric(draft.supervisor_sales_goal), focus_area: draft.focus_area, action_plan: draft.action_plan, owner: draft.owner, supervisor_labor_goal: numeric(draft.supervisor_labor_goal), supervisor_splh_goal: numeric(draft.supervisor_splh_goal), supervisor_food_variance_goal: numeric(draft.supervisor_food_variance_goal), supervisor_load_goal: numeric(draft.supervisor_load_goal), supervisor_adt_goal: numeric(draft.supervisor_adt_goal) } } });
    if (invokeError || !data?.ok) { setError(data?.error || invokeError?.message || "The commitment could not be saved."); setSaving(false); return; }
    const updated = data.result as Commitment;
    setCommitments((current) => current.map((item) => item.store === updated.store ? updated : item));
    setMessage(`Store ${updated.store} was updated in Google Sheets.`); setSaving(false);
  };

  const metrics = selected ? [["Sales", selected.sales.model_projection, selected.sales.recommended_goal, selected.sales.final_goal, selected.sales.actual, selected.sales.status], ["Labor", selected.labor.trajectory, selected.labor.suggested_goal, selected.labor.final_goal, selected.labor.actual, selected.labor.status], ["SPLH", selected.splh.trajectory, selected.splh.suggested_goal, selected.splh.final_goal, selected.splh.actual, selected.splh.status], ["Food variance", selected.food_variance.trajectory, selected.food_variance.suggested_goal, selected.food_variance.final_goal, selected.food_variance.actual, selected.food_variance.status], ["Load", selected.load.trajectory, selected.load.suggested_goal, selected.load.final_goal, selected.load.actual, selected.load.status], ["ADT", selected.adt.trajectory, selected.adt.suggested_goal, selected.adt.final_goal, selected.adt.actual, selected.adt.status]] : [];
  const rankings = ordered(scopedCommitments);
  const goalsMet = scopedCommitments.reduce((total, item) => total + score(item).hits, 0);
  const measuredGoals = scopedCommitments.reduce((total, item) => total + score(item).total, 0);

  return <div className="page kpi-page">
    <section className="page-heading heading-with-action"><div><p className="eyebrow">Performance command center</p><h1>KPI Dashboard</h1><p>Compare the company, focus on a supervisor group, or open one store’s weekly plan.</p></div><div className="kpi-week-controls"><label>Week ending<input type="date" value={weekEnd} onChange={(event) => setWeekEnd(event.target.value)} /></label><button className="button secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={17} /> Refresh</button></div></section>
    {error && <p className="inline-message kpi-error">{error}</p>}{message && <p className="inline-message"><CheckCircle2 size={17} /> {message}</p>}
    {access.canViewAll && <div className="kpi-view-switcher" role="tablist" aria-label="KPI view level"><button role="tab" aria-selected={viewLevel === "company"} className={viewLevel === "company" ? "active" : ""} onClick={() => setViewLevel("company")}><Building2 size={18} /><span>Whole company<small>All visible stores</small></span></button><button role="tab" aria-selected={viewLevel === "supervisor"} className={viewLevel === "supervisor" ? "active" : ""} onClick={() => setViewLevel("supervisor")} disabled={!access.supervisorGroups.length}><Users size={18} /><span>Supervisor view<small>Compare area groups</small></span></button><button role="tab" aria-selected={viewLevel === "store"} className={viewLevel === "store" ? "active" : ""} onClick={() => setViewLevel("store")}><Store size={18} /><span>Individual store<small>Detailed weekly plan</small></span></button></div>}
    {viewLevel === "supervisor" && access.canViewAll && <section className="kpi-scope-bar"><label>Supervisor group<select value={selectedGroup?.id ?? ""} onChange={(event) => setSelectedSupervisor(event.target.value)}>{access.supervisorGroups.map((group) => <option value={group.id} key={group.id}>{group.name} · {group.stores.length} stores</option>)}</select></label><p>Showing {selectedGroup?.stores.join(", ") || "no assigned stores"}</p></section>}
    {viewLevel === "store" && commitments.length > 0 && <div className="kpi-store-tabs" role="tablist" aria-label="Store selection">{commitments.map((item) => <button role="tab" aria-selected={selected?.store === item.store} className={selected?.store === item.store ? "active" : ""} key={item.store} onClick={() => setSelectedStore(item.store)}>Store {item.store}<span>{item.overall_status}</span></button>)}</div>}
    <section className="kpi-summary-grid"><article><BarChart3 size={21} /><span>{viewLevel === "supervisor" ? "Group stores" : viewLevel === "store" ? "Selected store" : "Company stores"}</span><strong>{scopedCommitments.length}</strong></article><article><Target size={21} /><span>Goals achieved</span><strong>{measuredGoals ? `${goalsMet}/${measuredGoals}` : "Pending"}</strong></article><article><Trophy size={21} /><span>Current leader</span><strong className="kpi-leader">{rankings[0] && score(rankings[0]).percent !== null ? `Store ${rankings[0].store}` : "Pending"}</strong></article></section>
    {loading ? <div className="empty-card"><RefreshCw className="spin" /><h2>Loading KPI commitments…</h2></div> : commitments.length === 0 ? <div className="empty-card"><Target /><h2>No commitments found</h2><p>There are no visible store rows for this week, or your store assignment still needs to be configured.</p></div> : viewLevel !== "store" ? <section className="panel table-panel kpi-leaderboard"><div className="table-toolbar"><div><p className="eyebrow">Friendly competition</p><h2>{viewLevel === "company" ? "Company leaderboard" : `${selectedGroup?.name ?? "Supervisor"} leaderboard`}</h2><p>Ranked by the share of measured weekly goals achieved.</p></div></div><div className="responsive-table"><table><thead><tr><th>Rank</th><th>Store</th><th>Goal score</th><th>Sales</th><th>Labor</th><th>Load</th><th>ADT</th><th>Overall</th></tr></thead><tbody>{rankings.map((item, index) => { const itemScore = score(item); return <tr key={item.store}><td><span className={`rank-badge rank-${index + 1}`}>{index + 1}</span></td><td><button className="kpi-store-link" onClick={() => { setSelectedStore(item.store); setViewLevel("store"); }}>Store {item.store}</button></td><td><strong>{itemScore.percent === null ? "Pending" : `${itemScore.percent}%`}</strong><small className="kpi-score-detail">{itemScore.hits} of {itemScore.total} measured</small></td><td>{item.sales.actual || "Pending"}</td><td>{item.labor.actual || "Pending"}</td><td>{item.load.actual || "Pending"}</td><td>{item.adt.actual || "Pending"}</td><td><span className={`kpi-overall ${item.overall_status.toLowerCase().replaceAll(" ", "-")}`}>{item.overall_status || "Pending"}</span></td></tr>; })}</tbody></table></div></section> : selected && <div className="kpi-layout"><section className="panel table-panel kpi-results"><div className="table-toolbar"><div><p className="eyebrow">Store {selected.store}</p><h2>Weekly performance plan</h2></div><span className={`kpi-overall ${selected.overall_status.toLowerCase().replaceAll(" ", "-")}`}>{selected.overall_status}</span></div><div className="responsive-table"><table><thead><tr><th>Metric</th><th>Trajectory</th><th>Suggested</th><th>Final goal</th><th>Actual</th><th>Status</th></tr></thead><tbody>{metrics.map(([name, trajectory, suggested, finalGoal, actual, status]) => <tr key={name}><td><strong>{name}</strong></td><td>{trajectory || "—"}</td><td>{suggested || "—"}</td><td><strong>{finalGoal || "—"}</strong></td><td>{actual || "Pending"}</td><td><span className={`kpi-status ${String(status).toLowerCase()}`}>{status || "Pending"}</span></td></tr>)}</tbody></table></div></section><form className="panel kpi-editor" onSubmit={save}><div className="panel-heading"><div><p className="eyebrow">Supervisor commitment</p><h2>Set the weekly plan</h2></div><Target size={23} /></div><div className="kpi-goal-grid"><label>Sales goal<input type="number" step="1" value={draft.supervisor_sales_goal} disabled={!canEditSelected} onChange={(e) => setDraft({ ...draft, supervisor_sales_goal: e.target.value })} /></label><label>Labor goal<input type="number" step="0.001" value={draft.supervisor_labor_goal} disabled={!canEditSelected} onChange={(e) => setDraft({ ...draft, supervisor_labor_goal: e.target.value })} /></label><label>SPLH goal<input type="number" step="0.01" value={draft.supervisor_splh_goal} disabled={!canEditSelected} onChange={(e) => setDraft({ ...draft, supervisor_splh_goal: e.target.value })} /></label><label>Food variance goal<input type="number" step="0.001" value={draft.supervisor_food_variance_goal} disabled={!canEditSelected} onChange={(e) => setDraft({ ...draft, supervisor_food_variance_goal: e.target.value })} /></label><label>Load goal<input type="number" step="0.1" value={draft.supervisor_load_goal} disabled={!canEditSelected} onChange={(e) => setDraft({ ...draft, supervisor_load_goal: e.target.value })} /></label><label>ADT goal<input type="number" step="0.1" value={draft.supervisor_adt_goal} disabled={!canEditSelected} onChange={(e) => setDraft({ ...draft, supervisor_adt_goal: e.target.value })} /></label></div><label>Focus area<select value={draft.focus_area} disabled={!canEditSelected} onChange={(e) => setDraft({ ...draft, focus_area: e.target.value })}><option value="">Select a focus</option>{focusAreas.map((area) => <option key={area}>{area}</option>)}</select></label><label>Owner<input value={draft.owner} disabled={!canEditSelected} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} placeholder="Person accountable for the plan" /></label><label>Action plan<textarea rows={5} value={draft.action_plan} disabled={!canEditSelected} onChange={(e) => setDraft({ ...draft, action_plan: e.target.value })} placeholder="What will the store do differently this week?" /></label>{canEditSelected ? <button className="button primary full" disabled={saving}><Save size={17} />{saving ? "Saving to Google Sheets…" : "Save commitment"}</button> : <p className="security-note">You can compare this store, but only administrators or the assigned supervisor can edit its goals.</p>}</form></div>}
  </div>;
}
