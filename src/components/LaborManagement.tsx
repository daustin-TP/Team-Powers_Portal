import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileDown,
  History,
  RotateCcw,
  Save,
  Settings2,
  Upload,
  Users,
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import type { Profile } from "../types";

type LaborRole = "manager" | "insider" | "driver";
type View = "builder" | "employees" | "availability" | "settings" | "imports";
type Store = { id: string; name: string };
type TeamMember = {
  id: string;
  store_id: string;
  display_name: string;
  qualified_roles: LaborRole[];
  is_minor: boolean;
  active: boolean;
};
type Shift = {
  id: string;
  week_plan_id: string;
  day_of_week: number;
  role: LaborRole;
  start_time: string;
  end_time: string;
  assigned_member_id: string | null;
  notes: string;
  source: "suggested" | "manual";
};
type DayProjection = { day_of_week: number; projected_sales: number };
type Settings = {
  insider_items_per_15: number;
  manager_items_per_15: number;
  weekend_insider_items_per_15: number;
  weekend_manager_items_per_15: number;
  average_run_time_minutes: number;
  manager_preopen_minutes: number;
  manager_postclose_minutes: number;
  driver_postclose_minutes: number;
  manager_crossover_minutes: number;
  max_shift_hours: number;
  minimum_shift_hours: number;
  minor_break_after_hours: number;
  opening_driver_through_rush: boolean;
  late_driver_rule: "hour_before_close" | "until_close" | "second_closer";
};
type Availability = { member_id: string; day_of_week: number; start_time: string; end_time: string; available: boolean; kind: "standard" | "rto" };

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const roleOrder: Record<LaborRole, number> = { manager: 0, insider: 1, driver: 2 };
const demoStore: Store = { id: "demo-5491", name: "5491 · Smithville" };
const demoMembers: TeamMember[] = [
  { id: "allie", store_id: demoStore.id, display_name: "Allie Neely", qualified_roles: ["manager", "insider"], is_minor: false, active: true },
  { id: "jordan", store_id: demoStore.id, display_name: "Jordan Manager", qualified_roles: ["manager", "insider"], is_minor: false, active: true },
  { id: "taylor", store_id: demoStore.id, display_name: "Taylor Insider", qualified_roles: ["insider"], is_minor: true, active: true },
  { id: "morgan", store_id: demoStore.id, display_name: "Morgan Driver", qualified_roles: ["driver", "insider"], is_minor: false, active: true },
  { id: "casey", store_id: demoStore.id, display_name: "Casey Driver", qualified_roles: ["driver"], is_minor: false, active: true },
];
const defaultSettings: Settings = {
  insider_items_per_15: 6,
  manager_items_per_15: 5,
  weekend_insider_items_per_15: 5,
  weekend_manager_items_per_15: 4,
  average_run_time_minutes: 15,
  manager_preopen_minutes: 60,
  manager_postclose_minutes: 60,
  driver_postclose_minutes: 60,
  manager_crossover_minutes: 60,
  max_shift_hours: 9,
  minimum_shift_hours: 3,
  minor_break_after_hours: 5.75,
  opening_driver_through_rush: true,
  late_driver_rule: "until_close",
};
const demoAvailability: Availability[] = [
  { member_id: "taylor", day_of_week: 4, start_time: "00:00", end_time: "23:59", available: false, kind: "rto" },
  { member_id: "morgan", day_of_week: 6, start_time: "10:00", end_time: "16:00", available: true, kind: "standard" },
];

function mondayOfCurrentWeek() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date.toISOString().slice(0, 10);
}
function shiftHours(shift: Pick<Shift, "start_time" | "end_time">) {
  const [startHour, startMinute] = shift.start_time.split(":").map(Number);
  const [endHour, endMinute] = shift.end_time.split(":").map(Number);
  let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (minutes <= 0) minutes += 24 * 60;
  return minutes / 60;
}
function displayTime(value: string) {
  const [hourValue, minute] = value.slice(0, 5).split(":").map(Number);
  const suffix = hourValue >= 12 ? "PM" : "AM";
  const hour = hourValue % 12 || 12;
  return `${hour}:${String(minute).padStart(2, "0")} ${suffix}`;
}
function demoShifts(): Shift[] {
  const result: Shift[] = [];
  days.forEach((_, day) => {
    const weekend = day >= 4;
    const close = weekend && day < 6 ? "01:00" : "00:00";
    const rows: Array<[LaborRole, string, string]> = [
      ["manager", "09:00", "17:00"], ["manager", "16:00", close],
      ["insider", "11:00", "16:00"], ["insider", "16:30", weekend ? "23:30" : "22:30"],
      ["driver", "10:00", "18:30"], ["driver", "16:30", close],
    ];
    if (weekend) rows.push(["insider", "17:00", "21:00"], ["driver", "17:00", "22:00"]);
    rows.forEach(([role, start_time, end_time], index) => result.push({ id: `${day}-${role}-${index}`, week_plan_id: "demo-plan", day_of_week: day, role, start_time, end_time, assigned_member_id: null, notes: "", source: "suggested" }));
  });
  return result;
}
function formatWeek(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export default function LaborManagement({ profile }: { profile: Profile }) {
  const [view, setView] = useState<View>("builder");
  const [weekStart, setWeekStart] = useState(mondayOfCurrentWeek());
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [planId, setPlanId] = useState("");
  const [planStatus, setPlanStatus] = useState("draft");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [projections, setProjections] = useState<DayProjection[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [selectedDay, setSelectedDay] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedStore = stores.find((store) => store.id === storeId);
  const visibleShifts = useMemo(() => shifts
    .filter((shift) => shift.day_of_week === selectedDay)
    .sort((left, right) => roleOrder[left.role] - roleOrder[right.role] || left.start_time.localeCompare(right.start_time)), [shifts, selectedDay]);
  const totalHours = shifts.reduce((sum, shift) => sum + shiftHours(shift), 0);
  const weeklySales = projections.reduce((sum, day) => sum + Number(day.projected_sales || 0), 0);
  const weeklySplh = totalHours ? weeklySales / totalHours : 0;

  useEffect(() => {
    const loadStores = async () => {
      if (!isSupabaseConfigured || !supabase) {
        setStores([demoStore]); setStoreId(demoStore.id); setLoading(false); return;
      }
      const { data, error: storeError } = await supabase.from("stores").select("id,name").eq("active", true).order("name");
      if (storeError) { setError(storeError.message); setLoading(false); return; }
      const rows = (data ?? []) as Store[];
      const locationMatch = rows.find((store) => store.name.toLowerCase().includes(profile.location.toLowerCase()));
      setStores(rows); setStoreId((current) => current || locationMatch?.id || rows[0]?.id || ""); setLoading(false);
    };
    void loadStores();
  }, [profile.location]);

  useEffect(() => {
    if (!storeId) return;
    const loadWeek = async () => {
      setLoading(true); setError(""); setMessage("");
      if (!isSupabaseConfigured || !supabase) {
        setPlanId("demo-plan"); setPlanStatus("draft"); setMembers(demoMembers); setShifts(demoShifts()); setAvailability(demoAvailability);
        setProjections(days.map((_, day_of_week) => ({ day_of_week, projected_sales: day_of_week >= 4 ? 5200 : 3600 })));
        setSettings(defaultSettings); setLoading(false); return;
      }
      const [memberResult, settingResult, planResult, standardResult, rtoResult] = await Promise.all([
        supabase.from("labor_team_members").select("id,store_id,display_name,qualified_roles,is_minor,active").eq("store_id", storeId).eq("active", true).order("display_name"),
        supabase.from("labor_store_settings").select("*").eq("store_id", storeId).maybeSingle(),
        supabase.from("labor_week_plans").select("id,status").eq("store_id", storeId).eq("week_start", weekStart).maybeSingle(),
        supabase.from("labor_standard_availability").select("member_id,day_of_week,start_time,end_time,available").eq("store_id", storeId),
        supabase.from("labor_time_off").select("member_id,day_of_week,start_time,end_time").eq("store_id", storeId).eq("week_start", weekStart),
      ]);
      const firstError = memberResult.error || settingResult.error || planResult.error || standardResult.error || rtoResult.error;
      if (firstError) { setError(`${firstError.message} Apply the Labor Management migration in Supabase, then refresh.`); setLoading(false); return; }
      setMembers((memberResult.data ?? []) as TeamMember[]);
      if (settingResult.data) setSettings({ ...defaultSettings, ...settingResult.data }); else setSettings(defaultSettings);
      const standard = (standardResult.data ?? []).map((item) => ({ ...item, kind: "standard" as const }));
      const rto = (rtoResult.data ?? []).map((item) => ({ ...item, available: false, kind: "rto" as const }));
      setAvailability([...standard, ...rto] as Availability[]);
      if (!planResult.data) { setPlanId(""); setPlanStatus("draft"); setShifts([]); setProjections([]); setLoading(false); return; }
      setPlanId(planResult.data.id); setPlanStatus(planResult.data.status);
      const [shiftResult, projectionResult] = await Promise.all([
        supabase.from("labor_shifts").select("id,week_plan_id,day_of_week,role,start_time,end_time,assigned_member_id,notes,source").eq("week_plan_id", planResult.data.id),
        supabase.from("labor_daily_projections").select("day_of_week,projected_sales").eq("week_plan_id", planResult.data.id),
      ]);
      if (shiftResult.error || projectionResult.error) setError(shiftResult.error?.message || projectionResult.error?.message || "Schedule could not be loaded.");
      setShifts((shiftResult.data ?? []) as Shift[]); setProjections((projectionResult.data ?? []) as DayProjection[]); setLoading(false);
    };
    void loadWeek();
  }, [storeId, weekStart]);

  useEffect(() => {
    if (!supabase || !planId || planId === "demo-plan") return;
    const channel = supabase.channel(`labor-plan-${planId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "labor_shifts", filter: `week_plan_id=eq.${planId}` }, () => {
        void supabase!.from("labor_shifts").select("id,week_plan_id,day_of_week,role,start_time,end_time,assigned_member_id,notes,source").eq("week_plan_id", planId).then(({ data }) => setShifts((data ?? []) as Shift[]));
      }).subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [planId]);

  const memberStatus = (member: TeamMember, shift: Shift) => {
    const entries = availability.filter((item) => item.member_id === member.id && item.day_of_week === shift.day_of_week);
    if (entries.some((item) => item.kind === "rto" || !item.available)) return "⛔";
    const limited = entries.find((item) => item.available && (item.start_time > shift.start_time || item.end_time < shift.end_time));
    return limited ? `⚠ ${displayTime(limited.start_time)}–${displayTime(limited.end_time)}` : "✓";
  };
  const overlaps = (candidateId: string, shift: Shift) => shifts.some((other) => other.id !== shift.id && other.day_of_week === shift.day_of_week && other.assigned_member_id === candidateId && shift.start_time < other.end_time && other.start_time < shift.end_time);
  const assign = async (shift: Shift, memberId: string) => {
    if (memberId && overlaps(memberId, shift)) { setError("That employee already has an overlapping shift on this day."); return; }
    setError(""); setShifts((current) => current.map((item) => item.id === shift.id ? { ...item, assigned_member_id: memberId || null } : item));
    if (supabase && shift.week_plan_id !== "demo-plan") {
      const { error: updateError } = await supabase.from("labor_shifts").update({ assigned_member_id: memberId || null, updated_at: new Date().toISOString() }).eq("id", shift.id);
      if (updateError) setError(updateError.message); else setMessage("Assignment saved.");
    }
  };
  const resetAssignments = async () => {
    if (!window.confirm("Clear every employee assignment for this week? Shift times will remain.")) return;
    setShifts((current) => current.map((shift) => ({ ...shift, assigned_member_id: null })));
    if (supabase && planId && planId !== "demo-plan") {
      const { error: updateError } = await supabase.from("labor_shifts").update({ assigned_member_id: null, updated_at: new Date().toISOString() }).eq("week_plan_id", planId);
      if (updateError) setError(updateError.message); else setMessage("Schedule assignments cleared.");
    }
  };
  const publish = async () => {
    if (!planId) { setError("Create or generate this week before publishing."); return; }
    if (!supabase || planId === "demo-plan") { setPlanStatus("published"); setMessage("Demo schedule published."); return; }
    const snapshot = { store: selectedStore?.name, week_start: weekStart, projections, shifts, members, published_by_name: profile.fullName };
    const { error: publicationError } = await supabase.from("labor_schedule_publications").insert({ week_plan_id: planId, store_id: storeId, week_start: weekStart, published_by: profile.id, snapshot });
    if (publicationError) { setError(publicationError.message); return; }
    await supabase.from("labor_week_plans").update({ status: "published", published_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", planId);
    setPlanStatus("published"); setMessage("Schedule published and saved to history.");
  };
  const saveSettings = async () => {
    if (!supabase) { setMessage("Demo settings saved locally."); return; }
    const { error: saveError } = await supabase.from("labor_store_settings").upsert({ store_id: storeId, ...settings, updated_at: new Date().toISOString() });
    if (saveError) setError(saveError.message); else setMessage("Store labor settings saved.");
  };
  const hoursByMember = members.map((member) => ({ member, hours: shifts.filter((shift) => shift.assigned_member_id === member.id).reduce((sum, shift) => sum + shiftHours(shift), 0) })).sort((a, b) => b.hours - a.hours);
  const daySales = projections.find((item) => item.day_of_week === selectedDay)?.projected_sales ?? 0;
  const dayHours = visibleShifts.reduce((sum, shift) => sum + shiftHours(shift), 0);

  return (
    <div className="page labor-page">
      <section className="page-heading heading-with-action labor-heading">
        <div><p className="eyebrow">Data-guided staffing</p><h1>Labor & Scheduling</h1><p>Build the minimum schedule from current sales, oven-item, and delivery trends—then apply manager judgment before publishing.</p></div>
        <div className="labor-plan-controls"><label>Store<select value={storeId} onChange={(event) => setStoreId(event.target.value)}>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label><label>Week of<input type="date" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} /></label></div>
      </section>
      {error && <p className="inline-message labor-error"><AlertTriangle size={18} />{error}</p>}
      {message && <p className="inline-message labor-success"><CheckCircle2 size={18} />{message}</p>}
      <div className="labor-nav" role="tablist">
        <button className={view === "builder" ? "active" : ""} onClick={() => setView("builder")}><CalendarClock />Schedule builder</button>
        <button className={view === "employees" ? "active" : ""} onClick={() => setView("employees")}><Users />Employees</button>
        <button className={view === "availability" ? "active" : ""} onClick={() => setView("availability")}><Clock3 />Availability</button>
        <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}><Settings2 />Settings</button>
        <button className={view === "imports" ? "active" : ""} onClick={() => setView("imports")}><Upload />Data & history</button>
      </div>
      {loading ? <div className="empty-card"><CalendarClock className="spin" /><h2>Loading labor plan…</h2></div> : view === "builder" ? (
        <>
          <section className="labor-summary-grid"><article><span>Projected sales</span><strong>${weeklySales.toLocaleString()}</strong><small>Week of {formatWeek(weekStart)}</small></article><article><span>Scheduled hours</span><strong>{totalHours.toFixed(1)}</strong><small>{shifts.length} required shifts</small></article><article><span>Projected SPLH</span><strong>${weeklySplh.toFixed(2)}</strong><small>Sales ÷ scheduled hours</small></article><article><span>Status</span><strong className="labor-status">{planStatus}</strong><small>{shifts.filter((shift) => !shift.assigned_member_id).length} open shifts</small></article></section>
          <div className="labor-toolbar"><div className="day-tabs">{days.map((day, index) => <button key={day} className={selectedDay === index ? "active" : ""} onClick={() => setSelectedDay(index)}>{day.slice(0, 3)}<small>{shifts.filter((shift) => shift.day_of_week === index).length}</small></button>)}</div><div className="button-row"><button className="button secondary" onClick={resetAssignments}><RotateCcw size={17} />Reset names</button><button className="button primary" onClick={publish}><FileDown size={17} />Publish</button></div></div>
          <section className="panel labor-day-panel"><div className="table-toolbar"><div><p className="eyebrow">{days[selectedDay]} builder</p><h2>Required shifts</h2><p>Managers first, then insiders and drivers; each group is ordered by start time.</p></div><div className="labor-day-metrics"><span>${Number(daySales).toLocaleString()} sales</span><strong>${dayHours ? (Number(daySales) / dayHours).toFixed(2) : "0.00"} SPLH</strong></div></div>
            {visibleShifts.length === 0 ? <div className="activity-empty">No suggested shifts have been generated for this day.</div> : <div className="responsive-table"><table className="labor-shift-table"><thead><tr><th>Role</th><th>Suggested time</th><th>Hours</th><th>Assigned employee</th><th>Availability</th><th>Notes</th></tr></thead><tbody>{visibleShifts.map((shift) => { const assigned = members.find((member) => member.id === shift.assigned_member_id); const status = assigned ? memberStatus(assigned, shift) : ""; return <tr key={shift.id} className={`${shift.role} ${shift.start_time <= "10:00" ? "opening" : ""} ${shift.end_time <= shift.start_time || shift.end_time >= "23:00" ? "closing" : ""}`}><td><strong>{shift.role[0].toUpperCase() + shift.role.slice(1)}</strong></td><td>{displayTime(shift.start_time)} – {displayTime(shift.end_time)}</td><td>{shiftHours(shift).toFixed(2)}</td><td><select value={shift.assigned_member_id ?? ""} onChange={(event) => void assign(shift, event.target.value)}><option value="">Open shift</option>{members.filter((member) => member.qualified_roles.includes(shift.role)).map((member) => <option key={member.id} value={member.id}>{memberStatus(member, shift)} {member.display_name}{member.is_minor ? " · Minor" : ""}</option>)}</select></td><td><span className={status.startsWith("⛔") ? "availability-bad" : status.startsWith("⚠") ? "availability-warning" : "availability-good"}>{status || "—"}</span></td><td>{shift.notes || (shift.source === "suggested" ? "Suggested from demand" : "Manager added")}</td></tr>; })}</tbody></table></div>}
          </section>
          <section className="panel labor-week-glance"><div className="panel-heading"><div><p className="eyebrow">Week at a glance</p><h2>Scheduled by role</h2></div></div><div className="week-grid">{days.map((day, index) => <article key={day}><h3>{day}</h3>{(["manager", "insider", "driver"] as LaborRole[]).map((role) => <div key={role}><strong>{role}s</strong>{shifts.filter((shift) => shift.day_of_week === index && shift.role === role).map((shift) => <span key={shift.id}>{members.find((member) => member.id === shift.assigned_member_id)?.display_name || "OPEN"}<small>{displayTime(shift.start_time)}–{displayTime(shift.end_time)}</small></span>)}</div>)}</article>)}</div></section>
        </>
      ) : view === "employees" ? (
        <section className="panel"><div className="table-toolbar"><div><p className="eyebrow">Weekly roster view</p><h2>Employee hours and assignments</h2></div></div><div className="responsive-table"><table><thead><tr><th>Employee</th><th>Roles</th><th>Minor</th><th>Weekly hours</th><th>Flag</th></tr></thead><tbody>{hoursByMember.map(({ member, hours }) => <tr key={member.id}><td><strong>{member.display_name}</strong></td><td>{member.qualified_roles.join(", ")}</td><td>{member.is_minor ? "◆" : "—"}</td><td>{hours.toFixed(2)}</td><td>{hours >= 40 ? <span className="availability-bad">OVERTIME</span> : hours >= 36 ? <span className="availability-warning">Close to OT</span> : "✓"}</td></tr>)}</tbody></table></div></section>
      ) : view === "availability" ? (
        <section className="panel"><div className="table-toolbar"><div><p className="eyebrow">Standard + week-specific</p><h2>Availability at a glance</h2><p>Standard availability remains in place. Requested time off applies only to the selected week.</p></div></div><div className="responsive-table"><table className="availability-table"><thead><tr><th>Employee</th>{days.map((day) => <th key={day}>{day.slice(0, 3)}</th>)}</tr></thead><tbody>{members.map((member) => <tr key={member.id}><td><strong>{member.display_name}</strong></td>{days.map((_, day) => { const entries = availability.filter((item) => item.member_id === member.id && item.day_of_week === day); const rto = entries.find((item) => item.kind === "rto" || !item.available); const limited = entries.find((item) => item.available); return <td key={day}>{rto ? <span className="availability-bad">⛔ RTO</span> : limited ? <span className="availability-warning">⚠ {displayTime(limited.start_time)}–{displayTime(limited.end_time)}</span> : <span className="availability-good">✓ Available</span>}</td>; })}</tr>)}</tbody></table></div></section>
      ) : view === "settings" ? (
        <section className="panel labor-settings"><div className="panel-heading"><div><p className="eyebrow">Store-specific rules</p><h2>Staffing assumptions</h2></div><button className="button primary" onClick={saveSettings}><Save size={17} />Save settings</button></div><div className="labor-settings-grid">
          <label>Insider oven items / 15 min<input type="number" step="0.5" value={settings.insider_items_per_15} onChange={(event) => setSettings({ ...settings, insider_items_per_15: Number(event.target.value) })} /></label><label>Manager oven items / 15 min<input type="number" step="0.5" value={settings.manager_items_per_15} onChange={(event) => setSettings({ ...settings, manager_items_per_15: Number(event.target.value) })} /></label><label>Fri/Sat insider items / 15 min<input type="number" step="0.5" value={settings.weekend_insider_items_per_15} onChange={(event) => setSettings({ ...settings, weekend_insider_items_per_15: Number(event.target.value) })} /></label><label>Fri/Sat manager items / 15 min<input type="number" step="0.5" value={settings.weekend_manager_items_per_15} onChange={(event) => setSettings({ ...settings, weekend_manager_items_per_15: Number(event.target.value) })} /></label><label>Average delivery run time<input type="number" step="1" value={settings.average_run_time_minutes} onChange={(event) => setSettings({ ...settings, average_run_time_minutes: Number(event.target.value) })} /></label><label>Manager crossover<select value={settings.manager_crossover_minutes} onChange={(event) => setSettings({ ...settings, manager_crossover_minutes: Number(event.target.value) })}>{[15,30,45,60,75,90,105,120].map((value) => <option key={value} value={value}>{value} minutes</option>)}</select></label><label>Minimum shift hours<input type="number" step="0.25" value={settings.minimum_shift_hours} onChange={(event) => setSettings({ ...settings, minimum_shift_hours: Number(event.target.value) })} /></label><label>Maximum shift hours<input type="number" step="0.25" value={settings.max_shift_hours} onChange={(event) => setSettings({ ...settings, max_shift_hours: Number(event.target.value) })} /></label><label>Late-driver rule<select value={settings.late_driver_rule} onChange={(event) => setSettings({ ...settings, late_driver_rule: event.target.value as Settings["late_driver_rule"] })}><option value="hour_before_close">One hour before close</option><option value="until_close">Until close</option><option value="second_closer">Second closing driver</option></select></label><label className="checkbox-line"><input type="checkbox" checked={settings.opening_driver_through_rush} onChange={(event) => setSettings({ ...settings, opening_driver_through_rush: event.target.checked })} />Allow opening driver through rush when it saves labor</label>
        </div></section>
      ) : (
        <div className="labor-data-grid"><section className="panel"><Upload size={27} /><p className="eyebrow">Weekly data intake</p><h2>Wizardline imports</h2><p>Upload the three Weekly Summary reports for each store: Royalty Sales, All Oven Items, and Delivery Orders. Imports are stored by store, week, date, and 15-minute interval.</p><button className="button primary" disabled><Upload size={17} />Import center coming next</button></section><section className="panel"><History size={27} /><p className="eyebrow">Permanent record</p><h2>Published schedule history</h2><p>Each publication creates an immutable snapshot. Managers can reopen an old week without overwriting the current schedule.</p><strong>{planStatus === "published" ? "This week is published" : "This week is still a draft"}</strong></section></div>
      )}
    </div>
  );
}
