import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, BookOpenCheck, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, History, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { Profile } from "../types";
import SupervisorVisitLog from "./SupervisorVisitLog";
import AreaSupervisorExpectations from "./AreaSupervisorExpectations";

type Store = { id: string; name: string; store_number: string | null };
type Supervisor = { id: string; full_name: string; store_id: string | null };
type Visit = {
  id: string;
  supervisor_id: string;
  store_id: string;
  visit_date: string;
  start_time: string;
  end_time: string;
  purpose: string;
  notes: string | null;
  status: "tentative" | "confirmed" | "cancelled";
  weekly_plan_id: string | null;
  edited_from_original: boolean;
  last_change_reason: string | null;
  _draft?: boolean;
  _dirty?: boolean;
  _deleted?: boolean;
};
type ChecklistRow = Record<string, boolean>;
type WeeklyPlan = {
  id: string;
  supervisor_id: string;
  week_start: string;
  days_off: string;
  hours_by_day: Record<string, string>;
  rush_shifts: { weeknight_done?: boolean; weeknight_day?: string; weekend_done?: boolean; weekend_day?: string };
  top_priorities: string;
  store_checklist: Record<string, ChecklistRow>;
  notes: string;
  status: "live" | "complete";
  updated_by: string;
  updated_at: string;
};
type KpiRow = { store_id: string; week_end: string; metrics: Record<string, unknown> };
type KpiData = { history?: KpiRow[]; results?: KpiRow[] };
type WorkspaceView = "current" | "history" | "visits" | "expectations";

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const storeChecks = [
  ["area_visit", "Area Supervisor visit"],
  ["game_day_visit", "Game day visit by 4 PM"],
  ["deposits_checked", "Last week’s deposits checked"],
  ["gm_schedule_submitted", "GM schedule submitted"],
  ["schedule_published", "Schedule published"],
] as const;
const visitRequirements = [
  { key: "training", label: "Training visits", target: 4, match: (purpose: string) => /training/i.test(purpose), add: "Training visit" },
  { key: "opening", label: "Opening visit", target: 1, match: (purpose: string) => purpose === "Opening visit", add: "Opening visit" },
  { key: "closing", label: "Closing visit", target: 1, match: (purpose: string) => purpose === "Closing visit", add: "Closing visit" },
  { key: "closed", label: "Closed visit", target: 1, match: (purpose: string) => purpose === "Closed visit", add: "Closed visit" },
  { key: "rush", label: "Rush observation", target: 1, match: (purpose: string) => purpose === "Rush observation", add: "Rush observation" },
  { key: "game-day", label: "Game Day visits", target: "per-store" as const, match: (purpose: string) => purpose === "Game Day visit", add: "Game Day visit" },
  { key: "feel-good", label: "Feel-good visit", target: 1, match: (purpose: string) => purpose === "Feel-good visit", add: "Feel-good visit" },
  { key: "cut-test", label: "Cut test", target: 1, match: (purpose: string) => purpose === "Cut test", add: "Cut test" },
];
const visitOptions = ["Training visit", "Game Day visit", "Opening visit", "Closing visit", "Closed visit", "Rush observation", "Feel-good visit", "Cut test", "KPI / goal follow-up", "Operations review", "Schedule review", "Other"];
const connectedLogTypes = new Set(visitOptions.filter((option) => option !== "Other"));
const timeOptions = Array.from({ length: 88 }, (_, index) => {
  const totalMinutes = (6 * 60 + index * 15) % (24 * 60);
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
});
const metricConfigs = [
  { key: "sales", label: "Sales", source: "royalty_sales", lowerBetter: false, format: "currency" },
  { key: "labor", label: "Labor", source: "labor_percent", lowerBetter: true, format: "percent" },
  { key: "splh", label: "SPLH", source: "splh", lowerBetter: false, format: "currency" },
  { key: "food", label: "Food variance", source: "food_difference_percent", lowerBetter: true, format: "percent" },
  { key: "load", label: "Load", source: "avg_load", lowerBetter: true, format: "number" },
  { key: "adt", label: "ADT", source: "avg_adt", lowerBetter: true, format: "number" },
] as const;

function iso(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function fromIso(value: string) { return new Date(`${value}T12:00:00`); }
function addIsoDays(value: string, daysToAdd: number) { const date = fromIso(value); date.setDate(date.getDate() + daysToAdd); return iso(date); }
function monday(value = new Date()) { const date = new Date(value); date.setHours(12, 0, 0, 0); const day = date.getDay(); date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day)); return iso(date); }
function dateLabel(value: string) { return fromIso(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
function timeLabel(value: string) { const [hour, minute] = value.slice(0, 5).split(":").map(Number); return new Date(2000, 0, 1, hour, minute).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); }
function scheduleMinutes(value: string) { const [hour, minute] = value.slice(0, 5).split(":").map(Number); const total = hour * 60 + minute; return hour < 5 ? total + 24 * 60 : total; }
function numberValue(value: unknown) { if (value === null || value === undefined || value === "") return null; const parsed = Number(String(value).replace(/[$,%\s]/g, "")); return Number.isFinite(parsed) ? parsed : null; }
function average(values: number[]) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function formatMetric(value: number, format: string) { if (format === "currency") return value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: value > 1000 ? 0 : 2 }); if (format === "percent") return `${(Math.abs(value) <= 1 ? value * 100 : value).toFixed(1)}%`; return value.toFixed(2); }
function blankPlan(supervisorId: string, weekStart: string): Omit<WeeklyPlan, "id" | "updated_by" | "updated_at"> { return { supervisor_id: supervisorId, week_start: weekStart, days_off: "", hours_by_day: {}, rush_shifts: {}, top_priorities: "", store_checklist: {}, notes: "", status: "live" }; }
function isAllStores(store: Store) { return [store.name, store.store_number].some((value) => /^all\s*stores$/i.test((value ?? "").trim())); }

export default function AreaSupervisorDashboard({ profile, onOpenVisitLog }: { profile: Profile; onOpenVisitLog: (scheduleId: string) => void }) {
  const isAdmin = profile.role === "admin";
  const [weekStart, setWeekStart] = useState(() => monday());
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [supervisorId, setSupervisorId] = useState(profile.role === "supervisor" ? profile.id : "");
  const [stores, setStores] = useState<Store[]>([]);
  const [assignedStoreIds, setAssignedStoreIds] = useState<string[]>([]);
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [draft, setDraft] = useState(() => blankPlan(profile.id, monday()));
  const [visits, setVisits] = useState<Visit[]>([]);
  const [kpi, setKpi] = useState<KpiData>({});
  const [editorOpen, setEditorOpen] = useState(false);
  const [newVisit, setNewVisit] = useState({ store_id: "", visit_date: monday(), start_time: "09:00", end_time: "12:00", purpose: "Training visit", notes: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [visitDirty, setVisitDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>(() => {
    const saved = window.sessionStorage.getItem("dashos:supervisor-workspace-view");
    return saved === "history" || saved === "visits" || saved === "expectations" ? saved : "current";
  });
  const [pastPlans, setPastPlans] = useState<WeeklyPlan[]>([]);

  const weekEnd = addIsoDays(weekStart, 6);
  const storeMap = useMemo(() => new Map(stores.map((store) => [store.id, store])), [stores]);
  const assignedStores = useMemo(() => stores.filter((store) => assignedStoreIds.includes(store.id)), [stores, assignedStoreIds]);
  const storesForVisit = (purpose: string, currentStoreId?: string) => /training/i.test(purpose)
    ? stores
    : stores.filter((store) => assignedStoreIds.includes(store.id) || store.id === currentStoreId);
  const supervisorName = supervisors.find((item) => item.id === supervisorId)?.full_name ?? profile.fullName;
  const visibleVisits = useMemo(() => visits.filter((visit) => !visit._deleted), [visits]);
  const pendingVisitCount = visits.filter((visit) => visit._draft || visit._dirty || visit._deleted).length;

  const loadSupervisors = useCallback(async () => {
    if (!supabase) return;
    const query = supabase.from("profiles").select("id,full_name,store_id").eq("role", "supervisor").eq("active", true).order("full_name");
    const { data, error } = isAdmin ? await query : await query.eq("id", profile.id);
    if (error) { setMessage(error.message); return; }
    const rows = (data ?? []) as Supervisor[];
    setSupervisors(rows);
    setSupervisorId((current) => current || rows[0]?.id || profile.id);
  }, [isAdmin, profile.id]);

  const load = useCallback(async (showLoading = true) => {
    if (!supabase || !supervisorId) return;
    if (showLoading) setLoading(true);
    const selectedSupervisor = supervisors.find((item) => item.id === supervisorId);
    const [storeResult, assignmentResult, planResult, visitResult, historyResult, kpiResult] = await Promise.all([
      supabase.from("stores").select("id,name,store_number").eq("active", true).order("name"),
      supabase.from("profile_store_assignments").select("store_id").eq("profile_id", supervisorId),
      supabase.from("supervisor_weekly_plans").select("id,supervisor_id,week_start,days_off,hours_by_day,rush_shifts,top_priorities,store_checklist,notes,status,updated_by,updated_at").eq("supervisor_id", supervisorId).eq("week_start", weekStart).maybeSingle(),
      supabase.from("supervisor_visit_schedules").select("id,supervisor_id,store_id,visit_date,start_time,end_time,purpose,notes,status,weekly_plan_id,edited_from_original,last_change_reason").eq("supervisor_id", supervisorId).gte("visit_date", weekStart).lte("visit_date", weekEnd).neq("status", "cancelled").order("visit_date").order("start_time"),
      supabase.from("supervisor_weekly_plans").select("id,supervisor_id,week_start,days_off,hours_by_day,rush_shifts,top_priorities,store_checklist,notes,status,updated_by,updated_at").eq("supervisor_id", supervisorId).order("week_start", { ascending: false }).limit(52),
      supabase.functions.invoke("kpi-dashboard", { body: { week_end: addIsoDays(weekStart, -1) } }),
    ]);
    const firstError = [storeResult.error, assignmentResult.error, planResult.error, visitResult.error, historyResult.error].find(Boolean);
    if (firstError) { setMessage(firstError.message); setLoading(false); return; }
    const nextStores = ((storeResult.data ?? []) as Store[]).filter((store) => !isAllStores(store));
    const assigned = new Set((assignmentResult.data ?? []).map((row) => row.store_id));
    if (selectedSupervisor?.store_id) assigned.add(selectedSupervisor.store_id);
    setStores(nextStores);
    setAssignedStoreIds([...assigned]);
    const savedPlan = planResult.data as WeeklyPlan | null;
    setPlan(savedPlan);
    setDraft(savedPlan ?? blankPlan(supervisorId, weekStart));
    setVisits((visitResult.data ?? []) as Visit[]);
    setPastPlans((historyResult.data ?? []) as WeeklyPlan[]);
    setKpi((kpiResult.data?.ok ? kpiResult.data : {}) as KpiData);
    const firstStore = nextStores.find((store) => assigned.has(store.id));
    setNewVisit((current) => ({ ...current, store_id: assigned.has(current.store_id) ? current.store_id : (firstStore?.id ?? ""), visit_date: current.visit_date >= weekStart && current.visit_date <= weekEnd ? current.visit_date : weekStart }));
    setDirty(false);
    setVisitDirty(false);
    setLoading(false);
  }, [supervisorId, supervisors, weekStart, weekEnd]);

  useEffect(() => { void loadSupervisors(); }, [loadSupervisors]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { window.sessionStorage.setItem("dashos:supervisor-workspace-view", workspaceView); }, [workspaceView]);
  useEffect(() => {
    if (!supabase || !supervisorId) return;
    const client = supabase;
    const channel = client.channel(`area-supervisor-planner-${supervisorId}-${weekStart}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "supervisor_weekly_plans" }, () => { if (!dirty && !visitDirty) void load(false); })
      .on("postgres_changes", { event: "*", schema: "public", table: "supervisor_visit_schedules" }, () => { if (!dirty && !visitDirty) void load(false); })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [dirty, load, supervisorId, visitDirty, weekStart]);

  const changeDraft = (patch: Partial<typeof draft>) => { setDraft((current) => ({ ...current, ...patch })); setDirty(true); };
  const changePlanningContext = (change: () => void) => {
    if ((dirty || visitDirty) && !window.confirm("You have unsaved planner changes. Leave this week and discard them?")) return;
    change();
  };
  const savePlan = async (status = draft.status) => {
    if (!supabase || !supervisorId) return null;
    setBusy(true); setMessage("");
    const payload = { supervisor_id: supervisorId, week_start: weekStart, days_off: draft.days_off, hours_by_day: draft.hours_by_day, rush_shifts: draft.rush_shifts, top_priorities: draft.top_priorities, store_checklist: draft.store_checklist, notes: draft.notes, status, updated_by: profile.id };
    const query = plan
      ? supabase.from("supervisor_weekly_plans").update(payload).eq("id", plan.id)
      : supabase.from("supervisor_weekly_plans").insert({ ...payload, created_by: profile.id });
    const { data, error } = await query.select("id,supervisor_id,week_start,days_off,hours_by_day,rush_shifts,top_priorities,store_checklist,notes,status,updated_by,updated_at").single();
    setBusy(false);
    if (error) { setMessage(error.message); return null; }
    setPlan(data as WeeklyPlan); setDraft(data as WeeklyPlan); setDirty(false);
    setMessage(status === "complete" ? "Week marked complete. It remains editable as plans change." : "Weekly planner saved.");
    return data as WeeklyPlan;
  };

  const openAddVisit = (purpose = "Training visit", visitDate = weekStart) => {
    const eligibleStores = storesForVisit(purpose);
    setNewVisit((current) => ({ ...current, purpose, visit_date: visitDate, store_id: eligibleStores.some((store) => store.id === current.store_id) ? current.store_id : (eligibleStores[0]?.id ?? "") }));
    setEditorOpen(true);
  };
  const addVisit = () => {
    if (!newVisit.store_id || scheduleMinutes(newVisit.end_time) <= scheduleMinutes(newVisit.start_time)) return;
    const stagedVisit: Visit = { id: crypto.randomUUID(), ...newVisit, supervisor_id: supervisorId, weekly_plan_id: plan?.id ?? null, status: "tentative", edited_from_original: false, last_change_reason: null, _draft: true, _dirty: true };
    setVisits((current) => [...current, stagedVisit].sort((left, right) => left.visit_date.localeCompare(right.visit_date) || scheduleMinutes(left.start_time) - scheduleMinutes(right.start_time)));
    setVisitDirty(true);
    setEditorOpen(false);
    setMessage("Visit added to the working plan. Select Save updates when the week is ready.");
  };
  const editVisit = (visitId: string, patch: Partial<Visit>) => {
    setVisits((current) => current.map((item) => item.id === visitId ? { ...item, ...patch, _dirty: true } : item));
    setVisitDirty(true);
  };
  const selectVisitType = (visit: Visit, purpose: string) => {
    editVisit(visit.id, { purpose });
    if (!connectedLogTypes.has(purpose)) return;
    setMessage(`${purpose} has a connected visit log. Save the schedule, then use Complete visit log after the visit.`);
  };
  const cancelVisit = (visit: Visit) => {
    if (!window.confirm("Remove this visit from the working week? Saved visits remain in the audit history after updates are saved.")) return;
    if (visit._draft) {
      setVisits((current) => current.filter((item) => item.id !== visit.id));
      setVisitDirty(true);
      return;
    }
    const reason = window.prompt("Why did the plan change? (optional)") ?? "";
    editVisit(visit.id, { _deleted: true, last_change_reason: reason });
    setMessage("Visit removed from the working plan. Select Save updates to confirm the change.");
  };
  const saveVisitUpdates = async () => {
    if (!supabase || (!visitDirty && !dirty)) return;
    const client = supabase;
    let savedPlan = plan;
    if (!savedPlan || dirty) savedPlan = await savePlan();
    if (!savedPlan) return;
    setBusy(true);
    setMessage("");
    const drafts = visits.filter((visit) => visit._draft && !visit._deleted);
    const changed = visits.filter((visit) => !visit._draft && visit._dirty && !visit._deleted);
    const removed = visits.filter((visit) => !visit._draft && visit._deleted);
    const insertPayload = drafts.map((visit) => ({ id: visit.id, supervisor_id: supervisorId, store_id: visit.store_id, visit_date: visit.visit_date, start_time: visit.start_time.slice(0, 5), end_time: visit.end_time.slice(0, 5), purpose: visit.purpose, notes: visit.notes, weekly_plan_id: savedPlan?.id ?? null, status: "tentative", created_by: profile.id, updated_by: profile.id }));
    const results = await Promise.all([
      insertPayload.length ? client.from("supervisor_visit_schedules").upsert(insertPayload, { onConflict: "id" }) : Promise.resolve({ error: null }),
      ...changed.map((visit) => client.from("supervisor_visit_schedules").update({ store_id: visit.store_id, visit_date: visit.visit_date, start_time: visit.start_time.slice(0, 5), end_time: visit.end_time.slice(0, 5), purpose: visit.purpose, notes: visit.notes, weekly_plan_id: savedPlan?.id ?? visit.weekly_plan_id, last_change_reason: visit.last_change_reason, updated_by: profile.id }).eq("id", visit.id)),
      ...(removed.length ? [client.from("supervisor_visit_schedules").update({ status: "cancelled", updated_by: profile.id }).in("id", removed.map((visit) => visit.id))] : []),
    ]);
    const error = results.find((result) => result.error)?.error;
    setBusy(false);
    if (error) { setMessage(error.message); return; }
    setMessage("Weekly visit updates saved. Connected visit logs are ready from each scheduled visit.");
    await load(false);
  };

  const kpiFocus = useMemo(() => {
    const assigned = new Set(assignedStoreIds);
    const history = (kpi.history ?? []).filter((row) => assigned.has(row.store_id)).sort((a, b) => a.week_end.localeCompare(b.week_end));
    const latestByStore = new Map<string, KpiRow>();
    for (const row of [...history, ...(kpi.results ?? []).filter((item) => assigned.has(item.store_id))]) latestByStore.set(row.store_id, row);
    const storeScores = new Map<string, number>();
    for (const metric of metricConfigs) {
      const rows = [...latestByStore.values()].map((row) => ({ store_id: row.store_id, value: numberValue(row.metrics[metric.source]) })).filter((row): row is { store_id: string; value: number } => row.value !== null);
      rows.sort((a, b) => metric.lowerBetter ? b.value - a.value : a.value - b.value);
      rows.slice(0, 2).forEach((row, index) => storeScores.set(row.store_id, (storeScores.get(row.store_id) ?? 0) + (2 - index)));
    }
    const bottom = [...storeScores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([storeId, score]) => ({ storeId, score }));
    const trends: Array<{ storeId: string; label: string; oldValue: number; newValue: number; format: string; severity: number }> = [];
    for (const storeId of assigned) {
      const rows = history.filter((row) => row.store_id === storeId);
      for (const metric of metricConfigs) {
        const values = rows.map((row) => numberValue(row.metrics[metric.source])).filter((value): value is number => value !== null).slice(-6);
        if (values.length < 4) continue;
        const oldValue = average(values.slice(-4, -2)); const newValue = average(values.slice(-2));
        const worsening = metric.lowerBetter ? newValue > oldValue : newValue < oldValue;
        const severity = Math.abs(newValue - oldValue) / Math.max(Math.abs(oldValue), 0.01);
        if (worsening && severity >= 0.01) trends.push({ storeId, label: metric.label, oldValue, newValue, format: metric.format, severity });
      }
    }
    return { bottom, trends: trends.sort((a, b) => b.severity - a.severity).slice(0, 5) };
  }, [assignedStoreIds, kpi]);

  const planUpdatedBy = supervisors.find((item) => item.id === plan?.updated_by)?.full_name ?? (plan?.updated_by === profile.id ? profile.fullName : "leadership");
  return <div className="page area-supervisor-dashboard">
    <div className="page-heading supervisor-dashboard-heading">
      <div><p className="eyebrow">Director &amp; Area Supervisor workspace</p><h1>Weekly Visit Dashboard</h1><p>Plan the week, adjust it live, and connect store priorities to visits and follow-up.</p></div>
      <div className="supervisor-week-controls">
        {isAdmin && <label>Area Supervisor<select value={supervisorId} onChange={(event) => { const nextId = event.target.value; changePlanningContext(() => setSupervisorId(nextId)); }}>{supervisors.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label>}
        <div className="week-stepper"><button className="icon-button" aria-label="Previous week" onClick={() => changePlanningContext(() => setWeekStart(addIsoDays(weekStart, -7)))}><ChevronLeft /></button><label>Week of<input type="date" value={weekStart} onChange={(event) => { const nextWeek = monday(fromIso(event.target.value)); changePlanningContext(() => setWeekStart(nextWeek)); }}/></label><button className="icon-button" aria-label="Next week" onClick={() => changePlanningContext(() => setWeekStart(addIsoDays(weekStart, 7)))}><ChevronRight /></button></div>
      </div>
    </div>
    <nav className="supervisor-workspace-tabs" aria-label="Area Supervisor workspace views">
      <button className={workspaceView === "current" ? "active" : ""} onClick={() => setWorkspaceView("current")}><CalendarClock size={18}/>Current week</button>
      <button className={workspaceView === "history" ? "active" : ""} onClick={() => setWorkspaceView("history")}><History size={18}/>Past weeks</button>
      <button className={workspaceView === "visits" ? "active" : ""} onClick={() => setWorkspaceView("visits")}><ClipboardCheck size={18}/>Visit logs</button>
      <button className={workspaceView === "expectations" ? "active" : ""} onClick={() => setWorkspaceView("expectations")}><BookOpenCheck size={18}/>Expectations</button>
    </nav>
    {message && <p className="inline-message">{message}</p>}
    {workspaceView === "expectations" ? <AreaSupervisorExpectations/> : workspaceView === "visits" ? <div className="supervisor-workspace-embedded"><SupervisorVisitLog profile={profile} initialScheduleId={window.sessionStorage.getItem("dashos:visit-schedule")}/></div> : workspaceView === "history" ? <section className="panel supervisor-plan-history">
      <div className="table-toolbar"><div><p className="eyebrow">Weekly planner history</p><h2>{supervisorName}’s prior weeks</h2><p>Open any saved week to review it or continue making updates.</p></div></div>
      {pastPlans.length ? <div className="supervisor-history-list">{pastPlans.map((item) => <article key={item.id}><div><strong>{dateLabel(item.week_start)}–{dateLabel(addIsoDays(item.week_start, 6))}</strong><span className={`status-pill ${item.status}`}>{item.status === "complete" ? "Complete" : "Live"}</span></div><p>{item.top_priorities || item.notes || "No priorities or notes were entered."}</p><small>Updated {new Date(item.updated_at).toLocaleString()}</small><button className="button secondary compact" onClick={() => { setWeekStart(item.week_start); setWorkspaceView("current"); }}>Open week</button></article>)}</div> : <div className="activity-empty">No saved weekly plans yet.</div>}
    </section> : loading ? <section className="panel activity-empty">Loading {supervisorName}’s weekly planner…</section> : <>
      <section className="supervisor-kpi-focus">
        <article className="panel"><header><BarChart3 /><div><span>Area focus</span><strong>Bottom-store attention</strong></div></header>{kpiFocus.bottom.length ? kpiFocus.bottom.map((item) => <div className="focus-store" key={item.storeId}><b>{storeMap.get(item.storeId)?.name} {storeMap.get(item.storeId)?.store_number}</b><small>Appears near the bottom across {item.score} current KPI comparisons</small></div>) : <p>More KPI history is needed for this week.</p>}</article>
        <article className="panel"><header><AlertTriangle /><div><span>Trend watch</span><strong>Moving the wrong direction</strong></div></header>{kpiFocus.trends.length ? kpiFocus.trends.map((trend) => <div className="trend-warning" key={`${trend.storeId}-${trend.label}`}><b>{storeMap.get(trend.storeId)?.name} · {trend.label}</b><small>{formatMetric(trend.oldValue, trend.format)} → {formatMetric(trend.newValue, trend.format)} over the latest four reported weeks</small></div>) : <p>No clear negative four-week trends in the available results.</p>}</article>
      </section>

      <section className="panel weekly-planner-sheet">
        <header className="weekly-planner-title"><div><p className="eyebrow">Team Powers weekly checklist</p><h2>{supervisorName} · {dateLabel(weekStart)}–{dateLabel(weekEnd)}</h2></div><span className={`status-pill ${draft.status}`}>{draft.status === "complete" ? "Week complete" : "Live plan"}</span></header>
        <div className="supervisor-week-board">{days.map((day, index) => { const visitDate = addIsoDays(weekStart, index); const dayVisits = visibleVisits.filter((visit) => visit.visit_date === visitDate).sort((left, right) => scheduleMinutes(left.start_time) - scheduleMinutes(right.start_time)); return <section key={day} className="supervisor-day-card" onDragOver={(event) => { event.preventDefault(); event.currentTarget.classList.add("drag-over"); }} onDragLeave={(event) => event.currentTarget.classList.remove("drag-over")} onDrop={(event) => { event.preventDefault(); event.currentTarget.classList.remove("drag-over"); const purpose = event.dataTransfer.getData("text/visit-purpose"); if (purpose) openAddVisit(purpose, visitDate); }}><header><div><strong>{day}</strong><small>{dateLabel(visitDate)}</small></div><button className="icon-button" type="button" aria-label={`Add visit on ${day}`} onClick={() => openAddVisit("Training visit", visitDate)}><Plus size={16}/></button></header><label>Planned hours<input value={draft.hours_by_day[day] ?? ""} onChange={(event) => changeDraft({ hours_by_day: { ...draft.hours_by_day, [day]: event.target.value } })} placeholder="Hours / time" /></label><div className="day-visit-list">{dayVisits.map((visit) => <button type="button" key={visit.id} className={visit._draft || visit._dirty ? "pending" : ""} onClick={() => document.getElementById(`visit-${visit.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}><b>{timeLabel(visit.start_time)}</b><span>{visit.purpose}</span><small>{storeMap.get(visit.store_id)?.name ?? "Store"}</small></button>)}{!dayVisits.length && <button className="day-drop-zone" type="button" onClick={() => openAddVisit("Training visit", visitDate)}>Drop a visit here or tap +</button>}</div></section>; })}</div>
        <label className="supervisor-days-off">Days off<input value={draft.days_off} onChange={(event) => changeDraft({ days_off: event.target.value })} placeholder="Example: Thursday and Sunday" /></label>

        <div className="weekly-checklist-grid">
          <section><div className="section-title"><div><p className="eyebrow">Area visits</p><h3>Required visit mix</h3><small>Drag a visit onto a day, or tap Add.</small></div><button className="button secondary compact" onClick={() => openAddVisit()}><Plus size={15}/>Add visit</button></div><div className="visit-requirements">{visitRequirements.map((requirement) => { const completed = visibleVisits.filter((visit) => requirement.match(visit.purpose)).length; const target = requirement.target === "per-store" ? assignedStores.length : requirement.target; return <div draggable className={completed >= target ? "met draggable-visit" : "open draggable-visit"} key={requirement.key} onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("text/visit-purpose", requirement.add); }}><span>{completed >= target ? <CheckCircle2 /> : <CalendarClock />}</span><div><b>{requirement.label}</b><small>{completed} of {target} planned{requirement.target === "per-store" ? " · one per store" : ""}</small></div>{completed < target && <button onClick={() => openAddVisit(requirement.add)}>Add</button>}</div>; })}</div></section>
          <section><p className="eyebrow">Weekly rush shifts</p><h3>Required rush coverage</h3><div className="rush-requirements"><label className="check-row"><input type="checkbox" checked={Boolean(draft.rush_shifts.weeknight_done)} onChange={(event) => changeDraft({ rush_shifts: { ...draft.rush_shifts, weeknight_done: event.target.checked } })}/><span>One weeknight rush shift</span></label><input value={draft.rush_shifts.weeknight_day ?? ""} onChange={(event) => changeDraft({ rush_shifts: { ...draft.rush_shifts, weeknight_day: event.target.value } })} placeholder="Planned day"/><label className="check-row"><input type="checkbox" checked={Boolean(draft.rush_shifts.weekend_done)} onChange={(event) => changeDraft({ rush_shifts: { ...draft.rush_shifts, weekend_done: event.target.checked } })}/><span>Friday or Saturday night rush</span></label><input value={draft.rush_shifts.weekend_day ?? ""} onChange={(event) => changeDraft({ rush_shifts: { ...draft.rush_shifts, weekend_day: event.target.value } })} placeholder="Planned day"/></div><label className="priorities-field">Top priorities this week<textarea rows={5} value={draft.top_priorities} onChange={(event) => changeDraft({ top_priorities: event.target.value })} placeholder="Bottom-store focus, KPI actions, training priorities…"/></label></section>
          <section className="schedule-deadlines"><p className="eyebrow">Schedule deadlines</p><h3>Weekly handoff</h3><p><b>Wednesday by 8 PM</b><span>GMs submit schedules</span></p><p><b>Friday by 10 AM</b><span>Schedules are published</span></p><p><b>Sunday by 8 PM</b><span>Area Supervisors submit their schedules to the Director</span></p></section>
        </div>
      </section>

      <section className="panel live-visit-schedule"><div className="table-toolbar"><div><p className="eyebrow">Working schedule</p><h2>Visits and field work</h2><p>Plan freely without waiting. Nothing is published to the Team Calendar until Save updates is selected.</p></div><div className="visit-save-controls">{pendingVisitCount > 0 && <span>{pendingVisitCount} unsaved</span>}<button className="button secondary" onClick={() => openAddVisit()}><Plus size={16}/>Add visit</button><button className="button primary" disabled={busy || (!visitDirty && !dirty)} onClick={() => void saveVisitUpdates()}><Save size={16}/>{busy ? "Saving…" : "Save updates"}</button></div></div>{visibleVisits.length ? <div className="visit-schedule-list">{visibleVisits.map((visit) => <article id={`visit-${visit.id}`} key={visit.id} className={`${visit.edited_from_original ? "edited " : ""}${visit._draft || visit._dirty ? "pending" : ""}`}><div className="visit-schedule-date"><b>{fromIso(visit.visit_date).toLocaleDateString(undefined, { weekday: "short" })}</b><span>{dateLabel(visit.visit_date)}</span>{visit._draft || visit._dirty ? <small>Unsaved</small> : null}</div><div className="visit-schedule-fields"><label>Store<select value={visit.store_id} onChange={(event) => editVisit(visit.id, { store_id: event.target.value })}>{storesForVisit(visit.purpose, visit.store_id).map((store) => <option key={store.id} value={store.id}>{store.name} {store.store_number}</option>)}</select></label><label>Start<select value={visit.start_time.slice(0, 5)} onChange={(event) => editVisit(visit.id, { start_time: event.target.value })}>{timeOptions.map((time) => <option key={time} value={time}>{timeLabel(time)}</option>)}</select></label><label>End<select value={visit.end_time.slice(0, 5)} onChange={(event) => editVisit(visit.id, { end_time: event.target.value })}>{timeOptions.map((time) => <option key={time} value={time}>{timeLabel(time)}</option>)}</select></label><label>Type<select value={visit.purpose} onChange={(event) => selectVisitType(visit, event.target.value)}>{visitOptions.map((option) => <option key={option}>{option}</option>)}</select></label><label className="visit-notes">Notes<input value={visit.notes ?? ""} onChange={(event) => editVisit(visit.id, { notes: event.target.value })}/></label></div><div className="visit-schedule-actions">{visit.edited_from_original && <small>Edited from original{visit.last_change_reason ? ` · ${visit.last_change_reason}` : ""}</small>}{connectedLogTypes.has(visit.purpose) && (visit._draft || visit._dirty ? <small>Visit log available after save</small> : <button className="button secondary compact" onClick={() => { onOpenVisitLog(visit.id); setWorkspaceView("visits"); }}><ClipboardCheck size={14}/>Complete visit log</button>)}<button className="icon-button danger" aria-label="Remove visit" onClick={() => cancelVisit(visit)}><Trash2 size={16}/></button></div></article>)}</div> : <div className="activity-empty compact">No visits are scheduled yet. Drag a required visit onto a day or use Add visit.</div>}</section>

      <section className="panel store-weekly-checklist"><div className="table-toolbar"><div><p className="eyebrow">Per-store checklist</p><h2>Complete for every assigned store</h2></div></div><div className="responsive-table"><table><thead><tr><th>Store</th>{storeChecks.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead><tbody>{assignedStores.map((store) => <tr key={store.id}><td><b>{store.name}</b><small>{store.store_number}</small></td>{storeChecks.map(([key]) => <td key={key}><input aria-label={`${store.name} ${key}`} type="checkbox" checked={Boolean(draft.store_checklist[store.id]?.[key])} onChange={(event) => changeDraft({ store_checklist: { ...draft.store_checklist, [store.id]: { ...(draft.store_checklist[store.id] ?? {}), [key]: event.target.checked } } })}/></td>)}</tr>)}</tbody></table></div></section>

      <section className="panel supervisor-week-notes"><label>Weekly notes<textarea rows={5} value={draft.notes} onChange={(event) => changeDraft({ notes: event.target.value })} placeholder="Changes, outcomes, follow-up, or context for the Director…"/></label><div><small>{plan ? `Last saved ${new Date(plan.updated_at).toLocaleString()} by ${planUpdatedBy}` : "This week has not been saved yet."}</small><div className="button-row"><button className="button secondary" disabled={busy || draft.status === "live"} onClick={() => void savePlan("live")}><RotateCcw size={16}/>Return to live</button><button className="button secondary" disabled={busy} onClick={() => void savePlan("complete")}><CheckCircle2 size={16}/>Mark week complete</button><button className="button primary" disabled={busy || (!dirty && !visitDirty)} onClick={() => void saveVisitUpdates()}><Save size={16}/>{busy ? "Saving…" : "Save all updates"}</button></div></div></section>
    </>}

    {editorOpen && <div className="modal-backdrop" onClick={() => setEditorOpen(false)}><section className="ticket-modal supervisor-visit-editor" onClick={(event) => event.stopPropagation()}><p className="eyebrow">Working weekly schedule</p><h2>Add an Area Supervisor visit</h2><div className="calendar-form-row"><label>Date<input type="date" min={weekStart} max={weekEnd} value={newVisit.visit_date} onChange={(event) => setNewVisit({ ...newVisit, visit_date: event.target.value })}/></label><label>Store<select value={newVisit.store_id} onChange={(event) => setNewVisit({ ...newVisit, store_id: event.target.value })}>{storesForVisit(newVisit.purpose, newVisit.store_id).map((store) => <option key={store.id} value={store.id}>{store.name} {store.store_number}</option>)}</select></label></div><div className="calendar-form-row"><label>Start<select value={newVisit.start_time} onChange={(event) => setNewVisit({ ...newVisit, start_time: event.target.value })}>{timeOptions.map((time) => <option key={time} value={time}>{timeLabel(time)}</option>)}</select></label><label>End<select value={newVisit.end_time} onChange={(event) => setNewVisit({ ...newVisit, end_time: event.target.value })}>{timeOptions.map((time) => <option key={time} value={time}>{timeLabel(time)}</option>)}</select></label></div><label>Visit type<select value={newVisit.purpose} onChange={(event) => setNewVisit({ ...newVisit, purpose: event.target.value })}>{visitOptions.map((option) => <option key={option}>{option}</option>)}</select></label>{/training/i.test(newVisit.purpose) && <small>Training visits may be scheduled at any active Team Powers store.</small>}<label>Notes <small>(optional)</small><textarea rows={3} value={newVisit.notes} onChange={(event) => setNewVisit({ ...newVisit, notes: event.target.value })}/></label><p className="visit-editor-preview">{newVisit.visit_date ? `${dateLabel(newVisit.visit_date)} · ${timeLabel(newVisit.start_time)}–${timeLabel(newVisit.end_time)}` : "Choose a date and time"}</p><div className="button-row"><button className="button secondary" onClick={() => setEditorOpen(false)}>Cancel</button><button className="button primary" disabled={!newVisit.store_id || scheduleMinutes(newVisit.end_time) <= scheduleMinutes(newVisit.start_time)} onClick={addVisit}><Plus size={16}/>Add to working week</button></div></section></div>}
  </div>;
}
