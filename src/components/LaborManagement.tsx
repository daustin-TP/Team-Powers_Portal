import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileDown,
  History,
  RotateCcw,
  Save,
  Settings2,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import type { Profile } from "../types";

type LaborRole = "manager" | "insider" | "driver";
type View = "builder" | "employees" | "availability" | "events" | "settings" | "imports";
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
type DayProjection = { day_of_week: number; projected_sales: number; projected_oven_items?: number; projected_deliveries?: number };
type DemandInterval = {
  day_of_week: number;
  interval_start: string;
  projected_sales: number;
  projected_oven_items: number;
  projected_deliveries: number;
  required_managers: number;
  required_insiders: number;
  required_drivers: number;
};
type ForecastRun = {
  id: string;
  confidence_score: number;
  confidence_level: "low" | "moderate" | "high";
  confidence_reasons: string[];
  weekly_projection: {
    projected_sales: number;
    projected_orders: number;
    projected_oven_items: number;
    projected_deliveries: number;
    low_sales: number;
    high_sales: number;
  };
  method_version: string;
  created_at: string;
};
type StoreHour = { day_of_week: number; open_time: string; close_time: string };
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
type SchedulingEvent = {
  id: string;
  scope: "company" | "store";
  store_id: string | null;
  name: string;
  category: "promotion" | "holiday" | "local_event" | "school" | "sports" | "weather" | "operations" | "custom";
  start_date: string;
  end_date: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  recurrence: "none" | "annual";
  status: "draft" | "active" | "cancelled";
  impact_mode: "learning" | "manual";
  sales_lift_percent: number | null;
  order_count_lift_percent: number | null;
  oven_items_lift_percent: number | null;
  delivery_lift_percent: number | null;
  notes: string | null;
};
type EventForm = Omit<SchedulingEvent, "id" | "store_id" | "sales_lift_percent" | "order_count_lift_percent" | "oven_items_lift_percent" | "delivery_lift_percent"> & {
  id: string;
  store_id: string;
  sales_lift_percent: string;
  order_count_lift_percent: string;
  oven_items_lift_percent: string;
  delivery_lift_percent: string;
};

const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const defaultStoreHours = (): StoreHour[] => days.map((_, day_of_week) => ({
  day_of_week,
  open_time: "10:00",
  close_time: day_of_week === 4 || day_of_week === 5 ? "00:00" : "23:00",
}));
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
function timeToMinutes(value: string) {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}
function shiftMinuteRange(shift: Pick<Shift, "start_time" | "end_time">) {
  const start = timeToMinutes(shift.start_time);
  let end = timeToMinutes(shift.end_time);
  if (end <= start) end += 24 * 60;
  return { start, end };
}
function overlapMinutes(shift: Pick<Shift, "start_time" | "end_time">, periodStart: number, periodEnd: number) {
  const { start, end } = shiftMinuteRange(shift);
  return Math.max(0, Math.min(end, periodEnd) - Math.max(start, periodStart));
}
function halfStepCoverage(periodShifts: Shift[], periodStart: number, periodEnd: number) {
  const periodMinutes = Math.max(1, periodEnd - periodStart);
  const averageCoverage = periodShifts.reduce((total, shift) => total + overlapMinutes(shift, periodStart, periodEnd), 0) / periodMinutes;
  return Math.round(averageCoverage * 2) / 2;
}
function formatCoverage(value: number) {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}
function shiftCoversInterval(shift: Pick<Shift, "start_time" | "end_time">, interval: string, storeOpen: string) {
  const { start, end } = shiftMinuteRange(shift);
  let point = timeToMinutes(interval);
  if (point < timeToMinutes(storeOpen)) point += 24 * 60;
  return point >= start && point < end;
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
function addIsoDays(value: string, daysToAdd: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + daysToAdd);
  return date.toISOString().slice(0, 10);
}
function emptyEvent(weekStart: string, storeId: string, canCreateCompany: boolean): EventForm {
  return {
    id: "", scope: canCreateCompany ? "company" : "store", store_id: canCreateCompany ? "" : storeId,
    name: "", category: "custom", start_date: weekStart, end_date: weekStart, all_day: true,
    start_time: null, end_time: null, recurrence: "none", status: "active", impact_mode: "learning",
    sales_lift_percent: "", order_count_lift_percent: "", oven_items_lift_percent: "", delivery_lift_percent: "", notes: "",
  };
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
  const [demandIntervals, setDemandIntervals] = useState<DemandInterval[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [storeHours, setStoreHours] = useState<StoreHour[]>(defaultStoreHours);
  const [events, setEvents] = useState<SchedulingEvent[]>([]);
  const [forecast, setForecast] = useState<ForecastRun | null>(null);
  const [weeklySalesTarget, setWeeklySalesTarget] = useState("");
  const [generatingForecast, setGeneratingForecast] = useState(false);
  const canCreateCompanyEvent = profile.role === "supervisor" || profile.role === "admin";
  const [eventForm, setEventForm] = useState<EventForm>(() => emptyEvent(mondayOfCurrentWeek(), "", canCreateCompanyEvent));
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
  const weekEnd = addIsoDays(weekStart, 6);
  const weekEvents = events.filter((event) => event.status !== "cancelled" && event.start_date <= weekEnd && event.end_date >= weekStart && (event.scope === "company" || event.store_id === storeId));
  const selectedDayOpen = storeHours.find((hours) => hours.day_of_week === selectedDay)?.open_time ?? "10:00";
  const coverageRows = useMemo(() => demandIntervals
    .filter((interval) => interval.day_of_week === selectedDay)
    .sort((left, right) => {
      const openMinute = timeToMinutes(selectedDayOpen);
      const businessOrder = (value: string) => { const minute = timeToMinutes(value); return minute < openMinute ? minute + 24 * 60 : minute; };
      return businessOrder(left.interval_start) - businessOrder(right.interval_start);
    })
    .map((interval) => {
      const scheduled = { manager: 0, insider: 0, driver: 0 };
      visibleShifts.forEach((shift) => { if (shiftCoversInterval(shift, interval.interval_start, selectedDayOpen)) scheduled[shift.role] += 1; });
      const required = { manager: Number(interval.required_managers), insider: Number(interval.required_insiders), driver: Number(interval.required_drivers) };
      const gaps = (Object.keys(required) as LaborRole[]).reduce((sum, role) => sum + Math.max(0, required[role] - scheduled[role]), 0);
      const excess = (Object.keys(required) as LaborRole[]).reduce((sum, role) => sum + Math.max(0, scheduled[role] - required[role]), 0);
      return { ...interval, required, scheduled, gaps, excess };
    }), [demandIntervals, selectedDay, selectedDayOpen, visibleShifts]);
  const coverageGapIntervals = coverageRows.filter((row) => row.gaps > 0).length;
  const coverageExactIntervals = coverageRows.filter((row) => row.gaps === 0 && row.excess === 0).length;

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
        setPlanId("demo-plan"); setPlanStatus("draft"); setMembers(demoMembers); setShifts(demoShifts()); setAvailability(demoAvailability); setDemandIntervals([]);
        setProjections(days.map((_, day_of_week) => ({ day_of_week, projected_sales: day_of_week >= 4 ? 5200 : 3600 })));
        setSettings(defaultSettings); setStoreHours(defaultStoreHours()); setLoading(false); return;
      }
      const [memberResult, settingResult, hoursResult, planResult, standardResult, rtoResult, eventResult, forecastResult] = await Promise.all([
        supabase.from("labor_team_members").select("id,store_id,display_name,qualified_roles,is_minor,active").eq("store_id", storeId).eq("active", true).order("display_name"),
        supabase.from("labor_store_settings").select("*").eq("store_id", storeId).maybeSingle(),
        supabase.from("labor_store_hours").select("day_of_week,open_time,close_time").eq("store_id", storeId).order("day_of_week"),
        supabase.from("labor_week_plans").select("id,status").eq("store_id", storeId).eq("week_start", weekStart).maybeSingle(),
        supabase.from("labor_standard_availability").select("member_id,day_of_week,start_time,end_time,available").eq("store_id", storeId),
        supabase.from("labor_time_off").select("member_id,day_of_week,start_time,end_time").eq("store_id", storeId).eq("week_start", weekStart),
        supabase.from("labor_scheduling_events").select("*").lte("start_date", addIsoDays(weekStart, 90)).gte("end_date", addIsoDays(weekStart, -35)).order("start_date"),
        supabase.from("demand_forecast_runs").select("id,confidence_score,confidence_level,confidence_reasons,weekly_projection,method_version,created_at").eq("store_id", storeId).eq("week_start", weekStart).eq("is_current", true).maybeSingle(),
      ]);
      const firstError = memberResult.error || settingResult.error || hoursResult.error || planResult.error || standardResult.error || rtoResult.error || eventResult.error || forecastResult.error;
      if (firstError) { setError(`${firstError.message} Apply the Labor Management migration in Supabase, then refresh.`); setLoading(false); return; }
      setMembers((memberResult.data ?? []) as TeamMember[]);
      if (settingResult.data) setSettings({ ...defaultSettings, ...settingResult.data }); else setSettings(defaultSettings);
      const loadedHours = (hoursResult.data ?? []).map((item) => ({ ...item, open_time: item.open_time.slice(0, 5), close_time: item.close_time.slice(0, 5) })) as StoreHour[];
      setStoreHours(loadedHours.length === 7 ? loadedHours : defaultStoreHours());
      const standard = (standardResult.data ?? []).map((item) => ({ ...item, kind: "standard" as const }));
      const rto = (rtoResult.data ?? []).map((item) => ({ ...item, available: false, kind: "rto" as const }));
      setAvailability([...standard, ...rto] as Availability[]);
      setEvents((eventResult.data ?? []) as SchedulingEvent[]);
      setForecast((forecastResult.data as ForecastRun | null) ?? null);
      setWeeklySalesTarget("");
      setEventForm((current) => current.id ? current : emptyEvent(weekStart, storeId, canCreateCompanyEvent));
      if (!planResult.data) { setPlanId(""); setPlanStatus("draft"); setShifts([]); setProjections([]); setDemandIntervals([]); setLoading(false); return; }
      setPlanId(planResult.data.id); setPlanStatus(planResult.data.status);
      const [shiftResult, projectionResult, demandResult] = await Promise.all([
        supabase.from("labor_shifts").select("id,week_plan_id,day_of_week,role,start_time,end_time,assigned_member_id,notes,source").eq("week_plan_id", planResult.data.id),
        supabase.from("labor_daily_projections").select("day_of_week,projected_sales").eq("week_plan_id", planResult.data.id),
        supabase.from("labor_demand_intervals").select("day_of_week,interval_start,projected_sales,projected_oven_items,projected_deliveries,required_managers,required_insiders,required_drivers").eq("week_plan_id", planResult.data.id),
      ]);
      if (shiftResult.error || projectionResult.error || demandResult.error) setError(shiftResult.error?.message || projectionResult.error?.message || demandResult.error?.message || "Schedule could not be loaded.");
      setShifts((shiftResult.data ?? []) as Shift[]); setProjections((projectionResult.data ?? []) as DayProjection[]); setDemandIntervals((demandResult.data ?? []) as DemandInterval[]); setLoading(false);
    };
    void loadWeek();
  }, [storeId, weekStart, canCreateCompanyEvent]);

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
    const snapshot = { store: selectedStore?.name, week_start: weekStart, projections, shifts, members, scheduling_events: weekEvents, published_by_name: profile.fullName };
    const { error: publicationError } = await supabase.from("labor_schedule_publications").insert({ week_plan_id: planId, store_id: storeId, week_start: weekStart, published_by: profile.id, snapshot });
    if (publicationError) { setError(publicationError.message); return; }
    await supabase.from("labor_week_plans").update({ status: "published", published_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", planId);
    setPlanStatus("published"); setMessage("Schedule published and saved to history.");
  };
  const saveSettings = async () => {
    if (!supabase) { setMessage("Demo settings saved locally."); return; }
    const [settingsResult, hoursResult] = await Promise.all([
      supabase.from("labor_store_settings").upsert({ store_id: storeId, ...settings, updated_at: new Date().toISOString() }),
      supabase.from("labor_store_hours").upsert(storeHours.map((item) => ({ store_id: storeId, ...item })), { onConflict: "store_id,day_of_week" }),
    ]);
    const saveError = settingsResult.error || hoursResult.error;
    if (saveError) setError(saveError.message); else setMessage("Store labor settings and hours saved.");
  };
  const generateForecast = async () => {
    setError(""); setMessage(""); setGeneratingForecast(true);
    if (!supabase) {
      setForecast({ id: "demo", confidence_score: 84, confidence_level: "high", confidence_reasons: ["34 comparable daylight baseline weeks", "Three demand metrics available", "Recent weekly results are current"], weekly_projection: { projected_sales: 28400, projected_orders: 1250, projected_oven_items: 1680, projected_deliveries: 510, low_sales: 26980, high_sales: 29820 }, method_version: "demand-v1", created_at: new Date().toISOString() });
      setMessage("Demo demand forecast generated."); setGeneratingForecast(false); return;
    }
    const target = weeklySalesTarget.trim() === "" ? null : Number(weeklySalesTarget);
    if (target !== null && (!Number.isFinite(target) || target <= 0)) { setError("Enter a valid weekly sales target or leave it blank for the engine recommendation."); setGeneratingForecast(false); return; }
    const { data, error: invokeError } = await supabase.functions.invoke("forecast-engine", { body: { action: "generate", store_id: storeId, week_start: weekStart, weekly_sales_target: target } });
    if (invokeError || !data?.ok) { setError(data?.error || invokeError?.message || "The forecast could not be generated."); setGeneratingForecast(false); return; }
    const result = data.result as { run: ForecastRun; daily: Array<DayProjection & { forecast_run_id: string }>; intervals: DemandInterval[]; shifts: Shift[]; plan_id: string | null; published_plan_preserved: boolean };
    setForecast(result.run); setProjections(result.daily); setDemandIntervals(result.intervals ?? []); setShifts(result.shifts ?? []); if (result.plan_id) setPlanId(result.plan_id);
    setMessage(result.published_plan_preserved ? "Forecast generated. The already-published schedule was preserved." : "Forecast and profit-minded suggested shifts generated from seasonal history, recent trends, and scheduled events.");
    setGeneratingForecast(false);
  };
  const editEvent = (event: SchedulingEvent) => {
    setEventForm({
      ...event,
      store_id: event.store_id ?? "",
      sales_lift_percent: event.sales_lift_percent?.toString() ?? "",
      order_count_lift_percent: event.order_count_lift_percent?.toString() ?? "",
      oven_items_lift_percent: event.oven_items_lift_percent?.toString() ?? "",
      delivery_lift_percent: event.delivery_lift_percent?.toString() ?? "",
    });
    setView("events");
  };
  const canEditEvent = (event: SchedulingEvent) => canCreateCompanyEvent || (profile.role === "manager" && event.scope === "store" && event.store_id === storeId);
  const saveEvent = async () => {
    setError(""); setMessage("");
    if (!eventForm.name.trim()) { setError("Enter an event name."); return; }
    if (eventForm.end_date < eventForm.start_date) { setError("The event end date cannot be before its start date."); return; }
    if (eventForm.scope === "store" && !eventForm.store_id) { setError("Choose the store affected by this event."); return; }
    if (eventForm.scope === "company" && !canCreateCompanyEvent) { setError("Only supervisors and administrators can create company-wide events."); return; }
    const lift = (value: string) => value.trim() === "" ? null : Number(value);
    const payload = {
      scope: eventForm.scope,
      store_id: eventForm.scope === "company" ? null : eventForm.store_id,
      name: eventForm.name.trim(), category: eventForm.category,
      start_date: eventForm.start_date, end_date: eventForm.end_date, all_day: eventForm.all_day,
      start_time: eventForm.all_day ? null : eventForm.start_time,
      end_time: eventForm.all_day ? null : eventForm.end_time,
      recurrence: eventForm.recurrence, status: eventForm.status, impact_mode: eventForm.impact_mode,
      sales_lift_percent: lift(eventForm.sales_lift_percent), order_count_lift_percent: lift(eventForm.order_count_lift_percent),
      oven_items_lift_percent: lift(eventForm.oven_items_lift_percent), delivery_lift_percent: lift(eventForm.delivery_lift_percent),
      notes: eventForm.notes?.trim() || null, updated_by: profile.id, updated_at: new Date().toISOString(),
    };
    if (!supabase) {
      const saved = { ...payload, id: eventForm.id || `demo-event-${Date.now()}` } as SchedulingEvent;
      setEvents((current) => eventForm.id ? current.map((item) => item.id === eventForm.id ? saved : item) : [...current, saved]);
      setEventForm(emptyEvent(weekStart, storeId, canCreateCompanyEvent)); setMessage("Event saved in this demo session."); return;
    }
    const request = eventForm.id
      ? supabase.from("labor_scheduling_events").update(payload).eq("id", eventForm.id).select("*").single()
      : supabase.from("labor_scheduling_events").insert({ ...payload, created_by: profile.id }).select("*").single();
    const { data, error: saveError } = await request;
    if (saveError || !data) { setError(saveError?.message || "The event could not be saved."); return; }
    setEvents((current) => eventForm.id ? current.map((item) => item.id === eventForm.id ? data as SchedulingEvent : item) : [...current, data as SchedulingEvent].sort((a, b) => a.start_date.localeCompare(b.start_date)));
    setEventForm(emptyEvent(weekStart, storeId, canCreateCompanyEvent)); setMessage("Scheduling event saved.");
  };
  const deleteEvent = async (event: SchedulingEvent) => {
    if (!canEditEvent(event) || !window.confirm(`Delete “${event.name}”? This cannot be undone.`)) return;
    if (supabase) {
      const { error: deleteError } = await supabase.from("labor_scheduling_events").delete().eq("id", event.id);
      if (deleteError) { setError(deleteError.message); return; }
    }
    setEvents((current) => current.filter((item) => item.id !== event.id));
    if (eventForm.id === event.id) setEventForm(emptyEvent(weekStart, storeId, canCreateCompanyEvent));
    setMessage("Scheduling event deleted.");
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
        <button className={view === "events" ? "active" : ""} onClick={() => setView("events")}><CalendarDays />Event calendar</button>
        <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}><Settings2 />Settings</button>
        <button className={view === "imports" ? "active" : ""} onClick={() => setView("imports")}><Upload />Data & history</button>
      </div>
      {loading ? <div className="empty-card"><CalendarClock className="spin" /><h2>Loading labor plan…</h2></div> : view === "builder" ? (
        <>
          <section className="panel forecast-command-panel">
            <div><p className="eyebrow">Shared demand forecast</p><h2>Generate the week’s operating projection</h2><p>Leave the sales target blank for the engine recommendation, or enter the approved weekly target to anchor the interval forecast.</p></div>
            <div className="forecast-command-actions"><label>Approved weekly sales target <span>Optional</span><div className="kpi-input-affix prefix"><span>$</span><input type="number" min="1" step="1" value={weeklySalesTarget} onChange={(event) => setWeeklySalesTarget(event.target.value)} placeholder="Use engine recommendation" /></div></label><button className="button primary" onClick={generateForecast} disabled={generatingForecast || !storeId}><CalendarClock size={17} />{generatingForecast ? "Calculating…" : forecast ? "Recalculate forecast" : "Generate forecast"}</button></div>
          </section>
          {forecast && <section className="forecast-confidence-panel"><div><span className={`forecast-confidence ${forecast.confidence_level}`}>{forecast.confidence_level} confidence · {Number(forecast.confidence_score).toFixed(0)}%</span><strong>${Number(forecast.weekly_projection.projected_sales).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><small>Expected range ${Number(forecast.weekly_projection.low_sales).toLocaleString(undefined, { maximumFractionDigits: 0 })}–${Number(forecast.weekly_projection.high_sales).toLocaleString(undefined, { maximumFractionDigits: 0 })}</small></div><div className="forecast-volume-grid"><span><strong>{Math.round(forecast.weekly_projection.projected_orders).toLocaleString()}</strong> orders</span><span><strong>{Math.round(forecast.weekly_projection.projected_oven_items).toLocaleString()}</strong> oven items</span><span><strong>{Math.round(forecast.weekly_projection.projected_deliveries).toLocaleString()}</strong> deliveries</span></div><details><summary>Why this confidence level?</summary><ul>{forecast.confidence_reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></details></section>}
          <section className="labor-summary-grid"><article><span>Projected sales</span><strong>${weeklySales.toLocaleString()}</strong><small>Week of {formatWeek(weekStart)}</small></article><article><span>Scheduled hours</span><strong>{totalHours.toFixed(1)}</strong><small>{shifts.length} required shifts</small></article><article><span>Projected SPLH</span><strong>${weeklySplh.toFixed(2)}</strong><small>Sales ÷ scheduled hours</small></article><article><span>Status</span><strong className="labor-status">{planStatus}</strong><small>{shifts.filter((shift) => !shift.assigned_member_id).length} open shifts</small></article></section>
          {weekEvents.length > 0 && <section className="labor-event-strip"><CalendarDays size={20} /><div><strong>{weekEvents.length === 1 ? "Demand event this week" : `${weekEvents.length} demand events this week`}</strong><div>{weekEvents.map((event) => <button key={event.id} onClick={() => editEvent(event)}><span>{event.scope === "company" ? "Company" : selectedStore?.name}</span>{event.name}</button>)}</div></div></section>}
          <div className="labor-toolbar"><div className="day-tabs">{days.map((day, index) => <button key={day} className={selectedDay === index ? "active" : ""} onClick={() => setSelectedDay(index)}>{day.slice(0, 3)}<small>{shifts.filter((shift) => shift.day_of_week === index).length}</small></button>)}</div><div className="button-row"><button className="button secondary" onClick={resetAssignments}><RotateCcw size={17} />Reset names</button><button className="button primary" onClick={publish}><FileDown size={17} />Publish</button></div></div>
          <section className="panel labor-day-panel"><div className="table-toolbar"><div><p className="eyebrow">{days[selectedDay]} builder</p><h2>Required shifts</h2><p>Managers first, then insiders and drivers; each group is ordered by start time.</p></div><div className="labor-day-metrics"><span>${Number(daySales).toLocaleString()} sales</span><strong>${dayHours ? (Number(daySales) / dayHours).toFixed(2) : "0.00"} SPLH</strong></div></div>
            {visibleShifts.length === 0 ? <div className="activity-empty">No suggested shifts have been generated for this day.</div> : <div className="responsive-table"><table className="labor-shift-table"><thead><tr><th>Role</th><th>Suggested time</th><th>Hours</th><th>Assigned employee</th><th>Availability</th><th>Notes</th></tr></thead><tbody>{visibleShifts.map((shift) => { const assigned = members.find((member) => member.id === shift.assigned_member_id); const status = assigned ? memberStatus(assigned, shift) : ""; return <tr key={shift.id} className={`${shift.role} ${shift.start_time <= "10:00" ? "opening" : ""} ${shift.end_time <= shift.start_time || shift.end_time >= "23:00" ? "closing" : ""}`}><td><strong>{shift.role[0].toUpperCase() + shift.role.slice(1)}</strong></td><td>{displayTime(shift.start_time)} – {displayTime(shift.end_time)}</td><td>{shiftHours(shift).toFixed(2)}</td><td><select value={shift.assigned_member_id ?? ""} onChange={(event) => void assign(shift, event.target.value)}><option value="">Open shift</option>{members.filter((member) => member.qualified_roles.includes(shift.role)).map((member) => <option key={member.id} value={member.id}>{memberStatus(member, shift)} {member.display_name}{member.is_minor ? " · Minor" : ""}</option>)}</select></td><td><span className={status.startsWith("⛔") ? "availability-bad" : status.startsWith("⚠") ? "availability-warning" : "availability-good"}>{status || "—"}</span></td><td>{shift.notes || (shift.source === "suggested" ? "Suggested from demand" : "Manager added")}</td></tr>; })}</tbody></table></div>}
          </section>
          <details className="panel labor-coverage-panel" open={coverageGapIntervals > 0}>
            <summary><div><p className="eyebrow">15-minute coverage check</p><h2>{days[selectedDay]} demand versus scheduled coverage</h2></div><div className="coverage-summary"><span className={coverageGapIntervals ? "gap" : "covered"}>{coverageGapIntervals ? `${coverageGapIntervals} intervals with gaps` : "✓ Every interval covered"}</span><small>{coverageExactIntervals} exact-fit intervals</small></div></summary>
            {coverageRows.length === 0 ? <div className="activity-empty">Generate the forecast to create the interval staffing requirements.</div> : <div className="responsive-table"><table className="coverage-table"><thead><tr><th>Time</th><th>Sales</th><th>Oven</th><th>Deliveries</th><th>Managers<br /><small>Need / Scheduled</small></th><th>Insiders<br /><small>Need / Scheduled</small></th><th>Drivers<br /><small>Need / Scheduled</small></th><th>Result</th></tr></thead><tbody>{coverageRows.map((row) => {
              const coverageCell = (role: LaborRole) => { const difference = row.scheduled[role] - row.required[role]; return <span className={difference < 0 ? "coverage-gap" : difference > 0 ? "coverage-extra" : "coverage-fit"}>{row.required[role]} / {row.scheduled[role]}</span>; };
              return <tr key={`${row.day_of_week}-${row.interval_start}`} className={row.gaps ? "has-gap" : row.excess ? "has-extra" : "is-covered"}><td><strong>{displayTime(row.interval_start)}</strong></td><td>${Number(row.projected_sales).toFixed(0)}</td><td>{Number(row.projected_oven_items).toFixed(1)}</td><td>{Number(row.projected_deliveries).toFixed(1)}</td><td>{coverageCell("manager")}</td><td>{coverageCell("insider")}</td><td>{coverageCell("driver")}</td><td>{row.gaps ? <span className="coverage-result gap">Short {row.gaps}</span> : row.excess ? <span className="coverage-result extra">+{row.excess} above minimum</span> : <span className="coverage-result covered">Exact</span>}</td></tr>;
            })}</tbody></table></div>}
          </details>
          <section className="panel labor-week-glance">
            <div className="panel-heading"><div><p className="eyebrow">Week at a glance</p><h2>Coverage by operating period</h2><p>Staffing equivalents are averaged across each period and rounded to the nearest 0.5. Open shifts count toward planned coverage.</p></div></div>
            <div className="week-grid">{days.map((day, dayIndex) => {
              const closeValue = storeHours.find((hours) => hours.day_of_week === dayIndex)?.close_time ?? "23:00";
              let closeMinutes = timeToMinutes(closeValue);
              if (closeMinutes <= 21 * 60) closeMinutes += 24 * 60;
              const periods = [
                { key: "day", label: "Day Shift", timeLabel: "10:00 AM–2:00 PM", start: 10 * 60, end: 14 * 60 },
                { key: "rush", label: "Rush", timeLabel: "4:00 PM–8:00 PM", start: 16 * 60, end: 20 * 60 },
                { key: "late", label: "Late Night", timeLabel: `9:00 PM–${displayTime(closeValue)}`, start: 21 * 60, end: closeMinutes },
              ];
              return <article key={day} className="week-day-card"><h3>{day}</h3>{periods.map((period) => <section key={period.key} className={`week-period ${period.key}`}><header><strong>{period.label}</strong><small>{period.timeLabel}</small></header>{(["manager", "insider", "driver"] as LaborRole[]).map((role) => {
                const periodShifts = shifts.filter((shift) => shift.day_of_week === dayIndex && shift.role === role && overlapMinutes(shift, period.start, period.end) > 0);
                const coverage = halfStepCoverage(periodShifts, period.start, period.end);
                return <div key={role} className="week-role-row"><div className="week-role-summary"><strong>{role}s</strong><b title="Average staffing coverage">{formatCoverage(coverage)}</b></div><div className="week-role-assignments">{periodShifts.length === 0 ? <span className="week-no-coverage">No coverage</span> : periodShifts.map((shift) => <span key={shift.id}>{members.find((member) => member.id === shift.assigned_member_id)?.display_name || "OPEN"}<small>{displayTime(shift.start_time)}–{displayTime(shift.end_time)}</small></span>)}</div></div>;
              })}</section>)}</article>;
            })}</div>
          </section>
        </>
      ) : view === "employees" ? (
        <section className="panel"><div className="table-toolbar"><div><p className="eyebrow">Weekly roster view</p><h2>Employee hours and assignments</h2></div></div><div className="responsive-table"><table><thead><tr><th>Employee</th><th>Roles</th><th>Minor</th><th>Weekly hours</th><th>Flag</th></tr></thead><tbody>{hoursByMember.map(({ member, hours }) => <tr key={member.id}><td><strong>{member.display_name}</strong></td><td>{member.qualified_roles.join(", ")}</td><td>{member.is_minor ? "◆" : "—"}</td><td>{hours.toFixed(2)}</td><td>{hours >= 40 ? <span className="availability-bad">OVERTIME</span> : hours >= 36 ? <span className="availability-warning">Close to OT</span> : "✓"}</td></tr>)}</tbody></table></div></section>
      ) : view === "availability" ? (
        <section className="panel"><div className="table-toolbar"><div><p className="eyebrow">Standard + week-specific</p><h2>Availability at a glance</h2><p>Standard availability remains in place. Requested time off applies only to the selected week.</p></div></div><div className="responsive-table"><table className="availability-table"><thead><tr><th>Employee</th>{days.map((day) => <th key={day}>{day.slice(0, 3)}</th>)}</tr></thead><tbody>{members.map((member) => <tr key={member.id}><td><strong>{member.display_name}</strong></td>{days.map((_, day) => { const entries = availability.filter((item) => item.member_id === member.id && item.day_of_week === day); const rto = entries.find((item) => item.kind === "rto" || !item.available); const limited = entries.find((item) => item.available); return <td key={day}>{rto ? <span className="availability-bad">⛔ RTO</span> : limited ? <span className="availability-warning">⚠ {displayTime(limited.start_time)}–{displayTime(limited.end_time)}</span> : <span className="availability-good">✓ Available</span>}</td>; })}</tr>)}</tbody></table></div></section>
      ) : view === "events" ? (
        <div className="labor-event-layout">
          <section className="panel labor-event-editor">
            <div className="panel-heading"><div><p className="eyebrow">Demand intelligence</p><h2>{eventForm.id ? "Edit scheduling event" : "Add scheduling event"}</h2><p>Record promotions, holidays, school events, sports, weather, and local traffic drivers.</p></div></div>
            <div className="labor-event-form">
              <label>Event name<input value={eventForm.name} onChange={(event) => setEventForm({ ...eventForm, name: event.target.value })} placeholder="Example: Homecoming game" /></label>
              <div className="labor-event-form-row"><label>Scope<select value={eventForm.scope} onChange={(event) => { const scope = event.target.value as EventForm["scope"]; setEventForm({ ...eventForm, scope, store_id: scope === "company" ? "" : (eventForm.store_id || storeId) }); }}><option value="store">Store-specific</option>{canCreateCompanyEvent && <option value="company">Company-wide</option>}</select></label><label>Category<select value={eventForm.category} onChange={(event) => setEventForm({ ...eventForm, category: event.target.value as EventForm["category"] })}>{["promotion","holiday","local_event","school","sports","weather","operations","custom"].map((category) => <option key={category} value={category}>{category.replace("_", " ")}</option>)}</select></label></div>
              {eventForm.scope === "store" && <label>Store<select value={eventForm.store_id || storeId} onChange={(event) => setEventForm({ ...eventForm, store_id: event.target.value })}>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>}
              <div className="labor-event-form-row"><label>Starts<input type="date" value={eventForm.start_date} onChange={(event) => setEventForm({ ...eventForm, start_date: event.target.value, end_date: eventForm.end_date < event.target.value ? event.target.value : eventForm.end_date })} /></label><label>Ends<input type="date" value={eventForm.end_date} onChange={(event) => setEventForm({ ...eventForm, end_date: event.target.value })} /></label></div>
              <label className="checkbox-line"><input type="checkbox" checked={eventForm.all_day} onChange={(event) => setEventForm({ ...eventForm, all_day: event.target.checked })} />All-day event</label>
              {!eventForm.all_day && <div className="labor-event-form-row"><label>Start time<input type="time" value={eventForm.start_time ?? ""} onChange={(event) => setEventForm({ ...eventForm, start_time: event.target.value })} /></label><label>End time<input type="time" value={eventForm.end_time ?? ""} onChange={(event) => setEventForm({ ...eventForm, end_time: event.target.value })} /></label></div>}
              <div className="labor-event-form-row"><label>Recurrence<select value={eventForm.recurrence} onChange={(event) => setEventForm({ ...eventForm, recurrence: event.target.value as EventForm["recurrence"] })}><option value="none">One time</option><option value="annual">Annual</option></select></label><label>Demand handling<select value={eventForm.impact_mode} onChange={(event) => setEventForm({ ...eventForm, impact_mode: event.target.value as EventForm["impact_mode"] })}><option value="learning">Track and learn</option><option value="manual">Use expected lift</option></select></label></div>
              <div className="labor-impact-grid"><label>Sales lift %<input type="number" step="0.1" value={eventForm.sales_lift_percent} onChange={(event) => setEventForm({ ...eventForm, sales_lift_percent: event.target.value })} placeholder="Unknown" /></label><label>Order lift %<input type="number" step="0.1" value={eventForm.order_count_lift_percent} onChange={(event) => setEventForm({ ...eventForm, order_count_lift_percent: event.target.value })} placeholder="Unknown" /></label><label>Oven-item lift %<input type="number" step="0.1" value={eventForm.oven_items_lift_percent} onChange={(event) => setEventForm({ ...eventForm, oven_items_lift_percent: event.target.value })} placeholder="Unknown" /></label><label>Delivery lift %<input type="number" step="0.1" value={eventForm.delivery_lift_percent} onChange={(event) => setEventForm({ ...eventForm, delivery_lift_percent: event.target.value })} placeholder="Unknown" /></label></div>
              <p className="labor-impact-help"><strong>Track and learn</strong> leaves unknown lifts blank, then lets actual reports teach the model. Expected lifts remain separate so a discount promotion does not look light simply because revenue grew less than orders.</p>
              <label>Notes<textarea value={eventForm.notes ?? ""} onChange={(event) => setEventForm({ ...eventForm, notes: event.target.value })} placeholder="What will change demand or operations?" /></label>
              <div className="button-row"><button className="button primary" onClick={saveEvent}><Save size={17} />{eventForm.id ? "Update event" : "Save event"}</button>{eventForm.id && <button className="button secondary" onClick={() => setEventForm(emptyEvent(weekStart, storeId, canCreateCompanyEvent))}>Cancel</button>}</div>
            </div>
          </section>
          <section className="panel labor-event-list"><div className="panel-heading"><div><p className="eyebrow">Shared calendar</p><h2>Upcoming and recent events</h2><p>Company events appear for every store. Local events appear only for their store.</p></div></div>
            {events.length === 0 ? <div className="activity-empty">No scheduling events have been added yet.</div> : <div className="event-card-list">{events.map((event) => <article key={event.id} className={`event-card ${event.status}`}><div className="event-date"><strong>{new Date(`${event.start_date}T12:00:00`).toLocaleDateString(undefined, { month: "short" })}</strong><span>{new Date(`${event.start_date}T12:00:00`).getDate()}</span></div><div className="event-copy"><div className="event-tags"><span>{event.scope === "company" ? "Company-wide" : stores.find((store) => store.id === event.store_id)?.name || "Store"}</span><span>{event.category.replace("_", " ")}</span><span>{event.impact_mode === "learning" ? "Learning" : "Expected lift"}</span></div><h3>{event.name}</h3><p>{event.start_date === event.end_date ? formatWeek(event.start_date) : `${formatWeek(event.start_date)} – ${formatWeek(event.end_date)}`}{event.recurrence === "annual" ? " · repeats annually" : ""}</p>{event.notes && <small>{event.notes}</small>}<div className="event-lifts">{event.sales_lift_percent !== null && <span>Sales {event.sales_lift_percent > 0 ? "+" : ""}{event.sales_lift_percent}%</span>}{event.order_count_lift_percent !== null && <span>Orders {event.order_count_lift_percent > 0 ? "+" : ""}{event.order_count_lift_percent}%</span>}{event.oven_items_lift_percent !== null && <span>Oven {event.oven_items_lift_percent > 0 ? "+" : ""}{event.oven_items_lift_percent}%</span>}{event.delivery_lift_percent !== null && <span>Delivery {event.delivery_lift_percent > 0 ? "+" : ""}{event.delivery_lift_percent}%</span>}</div></div>{canEditEvent(event) && <div className="event-actions"><button className="icon-button" aria-label={`Edit ${event.name}`} onClick={() => editEvent(event)}><Settings2 size={17} /></button><button className="icon-button danger" aria-label={`Delete ${event.name}`} onClick={() => void deleteEvent(event)}><Trash2 size={17} /></button></div>}</article>)}</div>}
          </section>
        </div>
      ) : view === "settings" ? (
        <section className="panel labor-settings"><div className="panel-heading"><div><p className="eyebrow">Store-specific rules</p><h2>Staffing assumptions</h2></div><button className="button primary" onClick={saveSettings}><Save size={17} />Save settings</button></div><div className="labor-settings-grid">
          <label>Insider oven items / 15 min<input type="number" step="0.5" value={settings.insider_items_per_15} onChange={(event) => setSettings({ ...settings, insider_items_per_15: Number(event.target.value) })} /></label><label>Manager oven items / 15 min<input type="number" step="0.5" value={settings.manager_items_per_15} onChange={(event) => setSettings({ ...settings, manager_items_per_15: Number(event.target.value) })} /></label><label>Fri/Sat insider items / 15 min<input type="number" step="0.5" value={settings.weekend_insider_items_per_15} onChange={(event) => setSettings({ ...settings, weekend_insider_items_per_15: Number(event.target.value) })} /></label><label>Fri/Sat manager items / 15 min<input type="number" step="0.5" value={settings.weekend_manager_items_per_15} onChange={(event) => setSettings({ ...settings, weekend_manager_items_per_15: Number(event.target.value) })} /></label><label>Average delivery run time<input type="number" step="1" value={settings.average_run_time_minutes} onChange={(event) => setSettings({ ...settings, average_run_time_minutes: Number(event.target.value) })} /></label><label>Manager crossover<select value={settings.manager_crossover_minutes} onChange={(event) => setSettings({ ...settings, manager_crossover_minutes: Number(event.target.value) })}>{[15,30,45,60,75,90,105,120].map((value) => <option key={value} value={value}>{value} minutes</option>)}</select></label><label>Minimum shift hours<input type="number" step="0.25" value={settings.minimum_shift_hours} onChange={(event) => setSettings({ ...settings, minimum_shift_hours: Number(event.target.value) })} /></label><label>Maximum shift hours<input type="number" step="0.25" value={settings.max_shift_hours} onChange={(event) => setSettings({ ...settings, max_shift_hours: Number(event.target.value) })} /></label><label>Late-driver rule<select value={settings.late_driver_rule} onChange={(event) => setSettings({ ...settings, late_driver_rule: event.target.value as Settings["late_driver_rule"] })}><option value="hour_before_close">One hour before close</option><option value="until_close">Until close</option><option value="second_closer">Second closing driver</option></select></label><label className="checkbox-line"><input type="checkbox" checked={settings.opening_driver_through_rush} onChange={(event) => setSettings({ ...settings, opening_driver_through_rush: event.target.checked })} />Allow opening driver through rush when it saves labor</label>
        </div><div className="labor-hours-section"><div><h3>Hours of operation</h3><p>Closing times after midnight belong to the business day shown. These hours drive opening and closing coverage.</p></div><div className="labor-hours-grid">{storeHours.map((item) => <div className="labor-hours-row" key={item.day_of_week}><strong>{days[item.day_of_week]}</strong><label>Open<input type="time" value={item.open_time} onChange={(event) => setStoreHours((current) => current.map((hour) => hour.day_of_week === item.day_of_week ? { ...hour, open_time: event.target.value } : hour))} /></label><label>Close<input type="time" value={item.close_time} onChange={(event) => setStoreHours((current) => current.map((hour) => hour.day_of_week === item.day_of_week ? { ...hour, close_time: event.target.value } : hour))} /></label></div>)}</div></div></section>
      ) : (
        <div className="labor-data-grid"><section className="panel"><Upload size={27} /><p className="eyebrow">Weekly data intake</p><h2>Wizardline imports</h2><p>Upload the three Weekly Summary reports for each store: Royalty Sales, All Oven Items, and Delivery Orders. Imports are stored by store, week, date, and 15-minute interval.</p><button className="button primary" disabled><Upload size={17} />Import center coming next</button></section><section className="panel"><History size={27} /><p className="eyebrow">Permanent record</p><h2>Published schedule history</h2><p>Each publication creates an immutable snapshot. Managers can reopen an old week without overwriting the current schedule.</p><strong>{planStatus === "published" ? "This week is published" : "This week is still a draft"}</strong></section></div>
      )}
    </div>
  );
}
