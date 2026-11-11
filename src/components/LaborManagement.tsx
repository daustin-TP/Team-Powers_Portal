import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileDown,
  History,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Settings2,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import type { Profile } from "../types";

type LaborRole = "manager" | "insider" | "driver";
type EmploymentStatus = "active" | "on_leave" | "borrowed" | "terminated" | "archived";
type View = "builder" | "employees" | "availability" | "events" | "settings" | "imports";
type Store = { id: string; name: string };
type TeamMember = {
  id: string;
  store_id: string;
  display_name: string;
  qualified_roles: LaborRole[];
  is_minor: boolean;
  active: boolean;
  employment_status: EmploymentStatus;
  home_store_id: string | null;
  status_reason: string;
  status_effective_date: string | null;
  status_notes: string;
  linked_hr_action_id: string | null;
};
type TerminationRecord = { id: string; employee_name: string; incident_date: string; incident_summary: string };
type TeamMemberPrivateDetails = {
  member_id: string;
  store_id: string;
  hire_date: string | null;
  rehire_date: string | null;
  evaluation_anniversary: string | null;
  birth_date: string | null;
};
type TeamMemberPosition = {
  id: string;
  member_id: string;
  store_id: string;
  position_name: string;
  hourly_rate: number | null;
  effective_date: string;
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
type ShiftChange = {
  id: string;
  store_id: string;
  week_plan_id: string;
  shift_id: string | null;
  day_of_week: number;
  role: LaborRole;
  change_type: "time_edited" | "manual_added" | "removed";
  change_summary: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  changed_by: string;
  changed_by_name: string;
  created_at: string;
};
type HistoricalShift = Pick<Shift, "week_plan_id" | "day_of_week" | "role" | "start_time" | "end_time" | "assigned_member_id">;
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
  oven_outlier_candidate: boolean;
  oven_outlier_status: "none" | "unreviewed" | "timed_order_week" | "timed_order_recurring" | "ignored_week" | "ignored_recurring" | "keep_full";
  oven_outlier_original: number | null;
  oven_outlier_baseline: number | null;
  oven_prep_minutes: number | null;
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
  driver_preopen_minutes: number;
  manager_postclose_minutes: number;
  driver_postclose_minutes: number;
  manager_crossover_minutes: number;
  max_shift_hours: number;
  minimum_shift_hours: number;
  minor_break_after_hours: number;
  opening_driver_through_rush: boolean;
  late_driver_rule: "hour_before_close" | "until_close" | "second_closer";
};
type Availability = { id?: string; member_id: string; day_of_week: number; start_time: string; end_time: string; available: boolean; kind: "standard" | "rto"; week_start?: string; reason?: string };
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
  { id: "allie", store_id: demoStore.id, display_name: "Allie Neely", qualified_roles: ["manager", "insider"], is_minor: false, active: true, employment_status: "active", home_store_id: null, status_reason: "", status_effective_date: null, status_notes: "", linked_hr_action_id: null },
  { id: "jordan", store_id: demoStore.id, display_name: "Jordan Manager", qualified_roles: ["manager", "insider"], is_minor: false, active: true, employment_status: "active", home_store_id: null, status_reason: "", status_effective_date: null, status_notes: "", linked_hr_action_id: null },
  { id: "taylor", store_id: demoStore.id, display_name: "Taylor Insider", qualified_roles: ["insider"], is_minor: true, active: true, employment_status: "active", home_store_id: null, status_reason: "", status_effective_date: null, status_notes: "", linked_hr_action_id: null },
  { id: "morgan", store_id: demoStore.id, display_name: "Morgan Driver", qualified_roles: ["driver", "insider"], is_minor: false, active: true, employment_status: "active", home_store_id: null, status_reason: "", status_effective_date: null, status_notes: "", linked_hr_action_id: null },
  { id: "casey", store_id: demoStore.id, display_name: "Casey Driver", qualified_roles: ["driver"], is_minor: false, active: true, employment_status: "active", home_store_id: null, status_reason: "", status_effective_date: null, status_notes: "", linked_hr_action_id: null },
];
const defaultSettings: Settings = {
  insider_items_per_15: 6,
  manager_items_per_15: 5,
  weekend_insider_items_per_15: 5,
  weekend_manager_items_per_15: 4,
  average_run_time_minutes: 15,
  manager_preopen_minutes: 60,
  driver_preopen_minutes: 0,
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

function mondayOfNextPlanningWeek() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 8);
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
function localTodayIso() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function formatScheduleDate(weekStart: string, dayIndex: number, compact = false) {
  const date = new Date(`${addIsoDays(weekStart, dayIndex)}T12:00:00`);
  return new Intl.DateTimeFormat(undefined, compact ? { month: "numeric", day: "numeric" } : { month: "short", day: "numeric" }).format(date);
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
  const [weekStart, setWeekStart] = useState(mondayOfNextPlanningWeek());
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [planId, setPlanId] = useState("");
  const [planStatus, setPlanStatus] = useState("draft");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [inactiveMembers, setInactiveMembers] = useState<TeamMember[]>([]);
  const [statusMember, setStatusMember] = useState<TeamMember | null>(null);
  const [statusDraft, setStatusDraft] = useState<{ status: EmploymentStatus; effective_date: string; reason: string; notes: string; home_store_id: string; hr_action_id: string }>({ status: "active", effective_date: localTodayIso(), reason: "", notes: "", home_store_id: "", hr_action_id: "" });
  const [terminationRecords, setTerminationRecords] = useState<TerminationRecord[]>([]);
  const [memberDetails, setMemberDetails] = useState<TeamMemberPrivateDetails[]>([]);
  const [memberPositions, setMemberPositions] = useState<TeamMemberPosition[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftChanges, setShiftChanges] = useState<ShiftChange[]>([]);
  const [projections, setProjections] = useState<DayProjection[]>([]);
  const [demandIntervals, setDemandIntervals] = useState<DemandInterval[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [storeHours, setStoreHours] = useState<StoreHour[]>(defaultStoreHours);
  const [events, setEvents] = useState<SchedulingEvent[]>([]);
  const [forecast, setForecast] = useState<ForecastRun | null>(null);
  const [weeklySalesTarget, setWeeklySalesTarget] = useState("");
  const [quickAdjustment, setQuickAdjustment] = useState<{ day_of_week: number; all_day: boolean; start_time: string; end_time: string; method: "percent" | "add_dollars" | "set_total"; value: string; label: string }>({ day_of_week: 0, all_day: true, start_time: "16:00", end_time: "18:00", method: "percent", value: "", label: "" });
  const [generatingForecast, setGeneratingForecast] = useState(false);
  const [autoFillHistoryWeeks, setAutoFillHistoryWeeks] = useState<number | null>(null);
  const [autoFillingNames, setAutoFillingNames] = useState(false);
  const canCreateCompanyEvent = profile.role === "supervisor" || profile.role === "admin";
  const [eventForm, setEventForm] = useState<EventForm>(() => emptyEvent(mondayOfNextPlanningWeek(), "", canCreateCompanyEvent));
  const [selectedDay, setSelectedDay] = useState(0);
  const [newShift, setNewShift] = useState<{ role: LaborRole; start_time: string; end_time: string }>({ role: "insider", start_time: "16:00", end_time: "20:00" });
  const [newMember, setNewMember] = useState<{ display_name: string; qualified_roles: LaborRole[]; is_minor: boolean; hire_date: string; birth_date: string; anniversary_different: boolean; evaluation_anniversary: string }>({ display_name: "", qualified_roles: ["insider"], is_minor: false, hire_date: "", birth_date: "", anniversary_different: false, evaluation_anniversary: "" });
  const [anniversaryOverrideMembers, setAnniversaryOverrideMembers] = useState<Set<string>>(new Set());
  const [positionMemberId, setPositionMemberId] = useState("");
  const [positionDraft, setPositionDraft] = useState({ position_name: "", hourly_rate: "", effective_date: localTodayIso() });
  const [availabilityForm, setAvailabilityForm] = useState<{ member_id: string; kind: "standard" | "rto"; day_of_week: number; standard_status: "available" | "unavailable" | "limited"; all_day: boolean; start_time: string; end_time: string; reason: string }>({ member_id: "", kind: "standard", day_of_week: 0, standard_status: "available", all_day: true, start_time: "10:00", end_time: "23:00", reason: "" });
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [consolidatePrint, setConsolidatePrint] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [builderZoom, setBuilderZoom] = useState<65 | 80 | 100>(100);
  const [savingOutlier, setSavingOutlier] = useState("");
  const [showHistoricalEvents, setShowHistoricalEvents] = useState(false);
  const schedulePrintRef = useRef<HTMLDivElement>(null);

  const selectedStore = stores.find((store) => store.id === storeId);
  const minorShiftLimit = Math.min(5.75, Number(settings.minor_break_after_hours) || 5.75);
  const visibleShifts = useMemo(() => shifts
    .filter((shift) => shift.day_of_week === selectedDay)
    .sort((left, right) => roleOrder[left.role] - roleOrder[right.role] || left.start_time.localeCompare(right.start_time)), [shifts, selectedDay]);
  const totalHours = shifts.reduce((sum, shift) => sum + shiftHours(shift), 0);
  const weeklySales = projections.reduce((sum, day) => sum + Number(day.projected_sales || 0), 0);
  const weeklySplh = totalHours ? weeklySales / totalHours : 0;
  const weekEnd = addIsoDays(weekStart, 6);
  const weekEvents = events.filter((event) => event.status !== "cancelled" && event.start_date <= weekEnd && event.end_date >= weekStart && (event.scope === "company" || event.store_id === storeId));
  const todayIso = localTodayIso();
  const historicalEvents = events.filter((event) => event.end_date < todayIso);
  const visibleEvents = showHistoricalEvents ? events : events.filter((event) => event.end_date >= todayIso);
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
  const unreviewedOutliers = coverageRows.filter((row) => row.oven_outlier_status === "unreviewed");

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
        setPlanId("demo-plan"); setPlanStatus("draft"); setMembers(demoMembers); setMemberDetails([]); setMemberPositions([]); setShifts(demoShifts()); setShiftChanges([]); setAvailability(demoAvailability); setAvailabilityForm((current) => ({ ...current, member_id: current.member_id || demoMembers[0].id })); setDemandIntervals([]);
        setProjections(days.map((_, day_of_week) => ({ day_of_week, projected_sales: day_of_week >= 4 ? 5200 : 3600 })));
        setSettings(defaultSettings); setStoreHours(defaultStoreHours()); setLoading(false); return;
      }
      const [memberResult, detailResult, positionResult, settingResult, hoursResult, planResult, standardResult, rtoResult, eventResult, forecastResult] = await Promise.all([
        supabase.from("labor_team_members").select("id,store_id,display_name,qualified_roles,is_minor,active,employment_status,home_store_id,status_reason,status_effective_date,status_notes,linked_hr_action_id").eq("store_id", storeId).order("display_name"),
        supabase.from("team_member_private_details").select("member_id,store_id,hire_date,rehire_date,evaluation_anniversary,birth_date").eq("store_id", storeId),
        supabase.from("team_member_positions").select("id,member_id,store_id,position_name,hourly_rate,effective_date,active").eq("store_id", storeId).eq("active", true).order("position_name"),
        supabase.from("labor_store_settings").select("*").eq("store_id", storeId).maybeSingle(),
        supabase.from("labor_store_hours").select("day_of_week,open_time,close_time").eq("store_id", storeId).order("day_of_week"),
        supabase.from("labor_week_plans").select("id,status").eq("store_id", storeId).eq("week_start", weekStart).maybeSingle(),
        supabase.from("labor_standard_availability").select("id,member_id,day_of_week,start_time,end_time,available").eq("store_id", storeId),
        supabase.from("labor_time_off").select("id,member_id,week_start,day_of_week,start_time,end_time,reason").eq("store_id", storeId).eq("week_start", weekStart),
        supabase.from("labor_scheduling_events").select("*").lte("start_date", addIsoDays(weekStart, 90)).gte("end_date", addIsoDays(weekStart, -420)).order("start_date"),
        supabase.from("demand_forecast_runs").select("id,confidence_score,confidence_level,confidence_reasons,weekly_projection,method_version,created_at").eq("store_id", storeId).eq("week_start", weekStart).eq("is_current", true).maybeSingle(),
      ]);
      const firstError = memberResult.error || detailResult.error || positionResult.error || settingResult.error || hoursResult.error || planResult.error || standardResult.error || rtoResult.error || eventResult.error || forecastResult.error;
      if (firstError) { setError(`${firstError.message} Apply the Labor Management migration in Supabase, then refresh.`); setLoading(false); return; }
      const loadedMembers = (memberResult.data ?? []) as TeamMember[];
      setMembers(loadedMembers.filter((member) => member.employment_status === "active" || member.employment_status === "borrowed"));
      setInactiveMembers(loadedMembers.filter((member) => member.employment_status !== "active" && member.employment_status !== "borrowed"));
      setMemberDetails((detailResult.data ?? []) as TeamMemberPrivateDetails[]);
      setMemberPositions((positionResult.data ?? []) as TeamMemberPosition[]);
      const schedulableMembers = loadedMembers.filter((member) => member.employment_status === "active" || member.employment_status === "borrowed");
      setAvailabilityForm((current) => ({ ...current, member_id: schedulableMembers.some((member) => member.id === current.member_id) ? current.member_id : schedulableMembers[0]?.id || "" }));
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
      if (!planResult.data) { setPlanId(""); setPlanStatus("draft"); setShifts([]); setShiftChanges([]); setProjections([]); setDemandIntervals([]); setLoading(false); return; }
      setPlanId(planResult.data.id); setPlanStatus(planResult.data.status);
      const [shiftResult, changeResult, projectionResult, demandResult] = await Promise.all([
        supabase.from("labor_shifts").select("id,week_plan_id,day_of_week,role,start_time,end_time,assigned_member_id,notes,source").eq("week_plan_id", planResult.data.id),
        supabase.from("labor_shift_changes").select("id,store_id,week_plan_id,shift_id,day_of_week,role,change_type,change_summary,before_state,after_state,changed_by,changed_by_name,created_at").eq("week_plan_id", planResult.data.id).order("created_at", { ascending: false }),
        supabase.from("labor_daily_projections").select("day_of_week,projected_sales").eq("week_plan_id", planResult.data.id),
        supabase.from("labor_demand_intervals").select("day_of_week,interval_start,projected_sales,projected_oven_items,projected_deliveries,required_managers,required_insiders,required_drivers,oven_outlier_candidate,oven_outlier_status,oven_outlier_original,oven_outlier_baseline,oven_prep_minutes").eq("week_plan_id", planResult.data.id),
      ]);
      if (shiftResult.error || changeResult.error || projectionResult.error || demandResult.error) setError(shiftResult.error?.message || changeResult.error?.message || projectionResult.error?.message || demandResult.error?.message || "Schedule could not be loaded.");
      setShifts((shiftResult.data ?? []) as Shift[]); setShiftChanges((changeResult.data ?? []) as ShiftChange[]); setProjections((projectionResult.data ?? []) as DayProjection[]); setDemandIntervals((demandResult.data ?? []) as DemandInterval[]); setLoading(false);
    };
    void loadWeek();
  }, [storeId, weekStart, canCreateCompanyEvent]);

  useEffect(() => {
    if (!supabase || !storeId || storeId === "demo-5491") { setAutoFillHistoryWeeks(0); return; }
    let cancelled = false;
    setAutoFillHistoryWeeks(null);
    void supabase.from("labor_week_plans").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("status", "published").lt("week_start", weekStart).then(({ count }) => {
      if (!cancelled) setAutoFillHistoryWeeks(count ?? 0);
    });
    return () => { cancelled = true; };
  }, [storeId, weekStart]);

  useEffect(() => {
    if (!supabase || !planId || planId === "demo-plan") return;
    const channel = supabase.channel(`labor-plan-${planId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "labor_shifts", filter: `week_plan_id=eq.${planId}` }, () => {
        void supabase!.from("labor_shifts").select("id,week_plan_id,day_of_week,role,start_time,end_time,assigned_member_id,notes,source").eq("week_plan_id", planId).then(({ data }) => setShifts((data ?? []) as Shift[]));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "labor_shift_changes", filter: `week_plan_id=eq.${planId}` }, () => {
        void supabase!.from("labor_shift_changes").select("id,store_id,week_plan_id,shift_id,day_of_week,role,change_type,change_summary,before_state,after_state,changed_by,changed_by_name,created_at").eq("week_plan_id", planId).order("created_at", { ascending: false }).then(({ data }) => setShiftChanges((data ?? []) as ShiftChange[]));
      }).subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [planId]);

  const memberStatus = (member: TeamMember, shift: Shift) => {
    const entries = availability.filter((item) => item.member_id === member.id && item.day_of_week === shift.day_of_week);
    const shiftOverlapsEntry = (item: Availability) => {
      const shiftRange = shiftMinuteRange(shift); const entryRange = shiftMinuteRange({ start_time: item.start_time, end_time: item.end_time });
      return shiftRange.start < entryRange.end && entryRange.start < shiftRange.end;
    };
    const weeklyRto = entries.find((item) => item.kind === "rto" && shiftOverlapsEntry(item));
    if (weeklyRto) {
      const allDay = weeklyRto.start_time.slice(0, 5) === "00:00" && weeklyRto.end_time.slice(0, 5) === "23:59";
      return allDay ? "⚠ Weekly RTO" : `⚠ Weekly RTO ${displayTime(weeklyRto.start_time)}–${displayTime(weeklyRto.end_time)}`;
    }
    if (entries.some((item) => item.kind === "standard" && !item.available && shiftOverlapsEntry(item))) return "⛔ Not available";
    const limited = entries.find((item) => item.kind === "standard" && item.available && !(item.start_time.slice(0, 5) === "00:00" && item.end_time.slice(0, 5) === "23:59") && (timeToMinutes(shift.start_time) < timeToMinutes(item.start_time) || shiftMinuteRange(shift).end > shiftMinuteRange({ start_time: item.start_time, end_time: item.end_time }).end));
    return limited ? `⚠ ${displayTime(limited.start_time)}–${displayTime(limited.end_time)}` : "✓";
  };
  const overlaps = (candidateId: string, shift: Shift) => shifts.some((other) => other.id !== shift.id && other.day_of_week === shift.day_of_week && other.assigned_member_id === candidateId && shift.start_time < other.end_time && other.start_time < shift.end_time);
  const returnPlanToDraft = async () => {
    if (planStatus !== "published") return;
    setPlanStatus("draft");
    if (supabase && planId && planId !== "demo-plan") await supabase.from("labor_week_plans").update({ status: "draft", published_at: null, updated_at: new Date().toISOString() }).eq("id", planId);
  };
  const refreshShiftChanges = async () => {
    if (!supabase || !planId || planId === "demo-plan") return;
    const { data } = await supabase.from("labor_shift_changes").select("id,store_id,week_plan_id,shift_id,day_of_week,role,change_type,change_summary,before_state,after_state,changed_by,changed_by_name,created_at").eq("week_plan_id", planId).order("created_at", { ascending: false });
    setShiftChanges((data ?? []) as ShiftChange[]);
  };
  const assign = async (shift: Shift, memberId: string) => {
    const member = members.find((item) => item.id === memberId);
    if (memberId && overlaps(memberId, shift)) { setError("That employee already has an overlapping shift on this day."); return; }
    setError(""); setShifts((current) => current.map((item) => item.id === shift.id ? { ...item, assigned_member_id: memberId || null } : item));
    const needsBreak = Boolean(member?.is_minor && shiftHours(shift) > minorShiftLimit);
    if (supabase && shift.week_plan_id !== "demo-plan") {
      const { error: updateError } = await supabase.from("labor_shifts").update({ assigned_member_id: memberId || null, updated_at: new Date().toISOString() }).eq("id", shift.id);
      if (updateError) setError(updateError.message); else { await returnPlanToDraft(); setMessage(needsBreak ? `${member?.display_name} assigned. This shift requires a 30-minute break.` : "Assignment saved."); }
    } else if (needsBreak) {
      setMessage(`${member?.display_name} assigned. This shift requires a 30-minute break.`);
    }
  };
  const autoFillScheduleNames = async () => {
    if (!supabase || !planId || planId === "demo-plan" || (autoFillHistoryWeeks ?? 0) < 3) return;
    const openShifts = shifts.filter((shift) => !shift.assigned_member_id);
    if (!openShifts.length) { setMessage("Every shift already has an assigned employee."); return; }
    if (!window.confirm("Suggest employees for the open shifts using published schedule history and this week’s availability? Existing assignments will be preserved.")) return;
    setAutoFillingNames(true); setError(""); setMessage("");
    const { data: historicalPlans, error: planHistoryError } = await supabase.from("labor_week_plans").select("id,week_start").eq("store_id", storeId).eq("status", "published").lt("week_start", weekStart).order("week_start", { ascending: false }).limit(12);
    if (planHistoryError || !historicalPlans || historicalPlans.length < 3) { setError(planHistoryError?.message || "At least three published schedule weeks are required before names can be suggested."); setAutoFillingNames(false); return; }
    const planIds = historicalPlans.map((plan) => plan.id);
    const { data: historyData, error: historyError } = await supabase.from("labor_shifts").select("week_plan_id,day_of_week,role,start_time,end_time,assigned_member_id").in("week_plan_id", planIds).not("assigned_member_id", "is", null);
    if (historyError) { setError(historyError.message); setAutoFillingNames(false); return; }
    const history = (historyData ?? []) as HistoricalShift[];
    const recency = new Map(planIds.map((id, index) => [id, 0.88 ** index]));
    const planned = shifts.map((shift) => ({ ...shift }));
    const weeklyHours = new Map(members.map((member) => [member.id, planned.filter((shift) => shift.assigned_member_id === member.id).reduce((sum, shift) => sum + shiftHours(shift), 0)]));
    const assignments: Array<{ shift: Shift; memberId: string; confidence: number }> = [];
    const orderedOpenShifts = [...openShifts].sort((left, right) => left.day_of_week - right.day_of_week || roleOrder[left.role] - roleOrder[right.role] || left.start_time.localeCompare(right.start_time));
    for (const shift of orderedOpenShifts) {
      const targetRange = shiftMinuteRange(shift);
      const duration = shiftHours(shift);
      const candidates = members.filter((member) => member.qualified_roles.includes(shift.role) && memberStatus(member, shift) === "✓").map((member) => {
        const wouldOverlap = planned.some((other) => {
          if (other.id === shift.id || other.day_of_week !== shift.day_of_week || other.assigned_member_id !== member.id) return false;
          const otherRange = shiftMinuteRange(other);
          return targetRange.start < otherRange.end && otherRange.start < targetRange.end;
        });
        if (wouldOverlap || (weeklyHours.get(member.id) ?? 0) + duration > 40) return { member, score: -1 };
        const matches = history.filter((prior) => prior.assigned_member_id === member.id && prior.day_of_week === shift.day_of_week && prior.role === shift.role);
        let score = matches.reduce((sum, prior) => {
          const priorRange = shiftMinuteRange(prior);
          const overlap = Math.max(0, Math.min(targetRange.end, priorRange.end) - Math.max(targetRange.start, priorRange.start));
          const similarity = overlap / Math.max(15, targetRange.end - targetRange.start, priorRange.end - priorRange.start);
          return sum + (recency.get(prior.week_plan_id) ?? 0.2) * (0.35 + similarity * 1.65);
        }, 0);
        score -= (weeklyHours.get(member.id) ?? 0) * 0.012;
        if (member.is_minor && duration > minorShiftLimit) score -= 0.75;
        return { member, score };
      }).filter((candidate) => candidate.score > 0.75).sort((left, right) => right.score - left.score || (weeklyHours.get(left.member.id) ?? 0) - (weeklyHours.get(right.member.id) ?? 0));
      const best = candidates[0];
      if (!best) continue;
      const confidence = Math.min(99, Math.round(55 + best.score * 10));
      const plannedShift = planned.find((item) => item.id === shift.id)!;
      plannedShift.assigned_member_id = best.member.id;
      weeklyHours.set(best.member.id, (weeklyHours.get(best.member.id) ?? 0) + duration);
      assignments.push({ shift, memberId: best.member.id, confidence });
    }
    if (!assignments.length) { setMessage("No open shifts had a strong enough historical match that also passed availability, overlap, and overtime checks."); setAutoFillingNames(false); return; }
    const assignmentIds = new Map(assignments.map((item) => [item.shift.id, item.memberId]));
    const rows = assignments.map(({ shift, memberId }) => ({ ...shift, assigned_member_id: memberId, updated_at: new Date().toISOString() }));
    const { error: saveError } = await supabase.from("labor_shifts").upsert(rows, { onConflict: "id" });
    if (saveError) { setError(saveError.message); setAutoFillingNames(false); return; }
    setShifts((current) => current.map((shift) => assignmentIds.has(shift.id) ? { ...shift, assigned_member_id: assignmentIds.get(shift.id)! } : shift));
    await returnPlanToDraft();
    const breakCount = assignments.filter(({ shift, memberId }) => members.find((member) => member.id === memberId)?.is_minor && shiftHours(shift) > minorShiftLimit).length;
    setMessage(`Suggested employees added to ${assignments.length} open shift${assignments.length === 1 ? "" : "s"} from ${historicalPlans.length} published weeks. Existing assignments were preserved.${breakCount ? ` ${breakCount} minor shift${breakCount === 1 ? " requires" : "s require"} a 30-minute break.` : ""} Review every suggestion before publishing.`);
    setAutoFillingNames(false);
  };
  const updateShiftTime = async (shift: Shift, field: "start_time" | "end_time", value: string) => {
    if (!/^\d{2}:\d{2}$/.test(value)) { setError("Choose a valid shift time."); return; }
    const candidate = { ...shift, [field]: value, source: "manual" as const };
    const hours = shiftHours(candidate);
    if (hours < settings.minimum_shift_hours || hours > settings.max_shift_hours) {
      setError(`Shifts must be between ${settings.minimum_shift_hours} and ${settings.max_shift_hours} hours.`); return;
    }
    const assignedMember = members.find((member) => member.id === shift.assigned_member_id);
    const needsBreak = Boolean(assignedMember?.is_minor && hours > minorShiftLimit);
    setError("");
    if (supabase && shift.week_plan_id !== "demo-plan") {
      const { data, error: updateError } = await supabase.rpc("mutate_labor_shift", { p_action: "edit_time", p_week_plan_id: shift.week_plan_id, p_shift_id: shift.id, p_day_of_week: shift.day_of_week, p_role: shift.role, p_start_time: candidate.start_time, p_end_time: candidate.end_time });
      if (updateError) { setError(updateError.message); return; }
      setShifts((current) => current.map((item) => item.id === shift.id ? data as Shift : item)); await refreshShiftChanges();
    } else {
      setShifts((current) => current.map((item) => item.id === shift.id ? candidate : item));
      setShiftChanges((current) => [{ id: `change-${Date.now()}`, store_id: storeId, week_plan_id: shift.week_plan_id, shift_id: shift.id, day_of_week: shift.day_of_week, role: shift.role, change_type: "time_edited", change_summary: `Time changed by ${profile.fullName}`, before_state: shift, after_state: candidate, changed_by: profile.id, changed_by_name: profile.fullName, created_at: new Date().toISOString() }, ...current]);
    }
    setPlanStatus("draft"); setMessage(needsBreak ? `Shift time saved. ${assignedMember?.display_name} requires a 30-minute break.` : "Shift time saved with editor attribution; coverage recalculated.");
  };
  const addManualShift = async () => {
    if (!planId) { setError("Generate this week’s forecast before adding a shift."); return; }
    if (!/^\d{2}:\d{2}$/.test(newShift.start_time) || !/^\d{2}:\d{2}$/.test(newShift.end_time)) { setError("Choose valid start and end times."); return; }
    const draft: Shift = { id: `manual-${Date.now()}`, week_plan_id: planId, day_of_week: selectedDay, role: newShift.role, start_time: newShift.start_time, end_time: newShift.end_time, assigned_member_id: null, notes: "Manager-added coverage", source: "manual" };
    const hours = shiftHours(draft);
    if (hours < settings.minimum_shift_hours || hours > settings.max_shift_hours) { setError(`Manual shifts must be between ${settings.minimum_shift_hours} and ${settings.max_shift_hours} hours.`); return; }
    setError("");
    if (!supabase || planId === "demo-plan") { setShifts((current) => [...current, draft]); setShiftChanges((current) => [{ id: `change-${Date.now()}`, store_id: storeId, week_plan_id: planId, shift_id: draft.id, day_of_week: selectedDay, role: draft.role, change_type: "manual_added", change_summary: `${draft.role} shift added`, before_state: null, after_state: draft, changed_by: profile.id, changed_by_name: profile.fullName, created_at: new Date().toISOString() }, ...current]); }
    else {
      const { data, error: insertError } = await supabase.rpc("mutate_labor_shift", { p_action: "add", p_week_plan_id: planId, p_shift_id: null, p_day_of_week: selectedDay, p_role: newShift.role, p_start_time: newShift.start_time, p_end_time: newShift.end_time });
      if (insertError) { setError(insertError.message); return; }
      setShifts((current) => [...current.filter((item) => item.id !== (data as Shift).id), data as Shift]); await refreshShiftChanges();
    }
    setPlanStatus("draft"); setMessage(`${newShift.role[0].toUpperCase() + newShift.role.slice(1)} shift added with editor attribution; coverage recalculated.`);
  };
  const deleteShift = async (shift: Shift) => {
    const employee = members.find((member) => member.id === shift.assigned_member_id)?.display_name;
    if (!window.confirm(`Remove this ${shift.role} shift${employee ? ` assigned to ${employee}` : ""}?`)) return;
    setError("");
    if (supabase && shift.week_plan_id !== "demo-plan") {
      const { error: deleteError } = await supabase.rpc("mutate_labor_shift", { p_action: "remove", p_week_plan_id: shift.week_plan_id, p_shift_id: shift.id, p_day_of_week: shift.day_of_week, p_role: shift.role, p_start_time: shift.start_time, p_end_time: shift.end_time });
      if (deleteError) { setError(deleteError.message); return; }
      await refreshShiftChanges();
    } else {
      setShiftChanges((current) => [{ id: `change-${Date.now()}`, store_id: storeId, week_plan_id: shift.week_plan_id, shift_id: null, day_of_week: shift.day_of_week, role: shift.role, change_type: "removed", change_summary: `${shift.role} shift removed`, before_state: shift, after_state: null, changed_by: profile.id, changed_by_name: profile.fullName, created_at: new Date().toISOString() }, ...current]);
    }
    setShifts((current) => current.filter((item) => item.id !== shift.id));
    setPlanStatus("draft"); setMessage("Shift removed with editor attribution; coverage recalculated.");
  };
  const addTeamMember = async () => {
    const displayName = newMember.display_name.trim();
    if (!displayName) { setError("Enter the employee’s name."); return; }
    if (newMember.qualified_roles.length === 0) { setError("Select at least one qualified role."); return; }
    setError("");
    const draft: TeamMember = { id: `member-${Date.now()}`, store_id: storeId, display_name: displayName, qualified_roles: newMember.qualified_roles, is_minor: newMember.is_minor, active: true, employment_status: "active", home_store_id: null, status_reason: "", status_effective_date: null, status_notes: "", linked_hr_action_id: null };
    let savedMember = draft;
    if (!supabase || storeId === demoStore.id) setMembers((current) => [...current, draft].sort((left, right) => left.display_name.localeCompare(right.display_name)));
    else {
      const { data, error: insertError } = await supabase.from("labor_team_members").insert({ store_id: storeId, display_name: displayName, qualified_roles: newMember.qualified_roles, is_minor: newMember.is_minor, active: true, employment_status: "active" }).select("id,store_id,display_name,qualified_roles,is_minor,active,employment_status,home_store_id,status_reason,status_effective_date,status_notes,linked_hr_action_id").single();
      if (insertError) { setError(insertError.message); return; }
      savedMember = data as TeamMember;
      setMembers((current) => [...current, savedMember].sort((left, right) => left.display_name.localeCompare(right.display_name)));
      if (newMember.hire_date || newMember.birth_date || (newMember.anniversary_different && newMember.evaluation_anniversary)) {
        const details = { member_id: savedMember.id, store_id: storeId, hire_date: newMember.hire_date || null, birth_date: newMember.birth_date || null, evaluation_anniversary: newMember.anniversary_different ? (newMember.evaluation_anniversary || null) : null, created_by: profile.id, updated_by: profile.id, updated_at: new Date().toISOString() };
        const { data: savedDetails, error: detailsError } = await supabase.from("team_member_private_details").upsert(details).select("member_id,store_id,hire_date,rehire_date,evaluation_anniversary,birth_date").single();
        if (detailsError) { setError(`${displayName} was added, but employment details could not be saved: ${detailsError.message}`); return; }
        setMemberDetails((current) => [...current.filter((item) => item.member_id !== savedMember.id), savedDetails as TeamMemberPrivateDetails]);
      }
    }
    setNewMember({ display_name: "", qualified_roles: ["insider"], is_minor: false, hire_date: "", birth_date: "", anniversary_different: false, evaluation_anniversary: "" }); setMessage(`${displayName} added to the scheduling roster.`);
  };
  const updateTeamMember = async (member: TeamMember, changes: Partial<Pick<TeamMember, "display_name" | "qualified_roles" | "is_minor">>) => {
    const updated = { ...member, ...changes };
    if (!updated.display_name.trim()) { setError("Employee names cannot be blank."); return; }
    if (updated.qualified_roles.length === 0) { setError("Each employee must have at least one qualified role."); return; }
    setError(""); setMembers((current) => current.map((item) => item.id === member.id ? updated : item));
    if (supabase && member.store_id !== demoStore.id) {
      const { error: updateError } = await supabase.from("labor_team_members").update({ ...changes, updated_at: new Date().toISOString() }).eq("id", member.id);
      if (updateError) { setError(updateError.message); return; }
    }
    setMessage(`${updated.display_name}’s roster settings saved.`);
  };
  const updatePrivateDetails = async (member: TeamMember, changes: Partial<Pick<TeamMemberPrivateDetails, "hire_date" | "rehire_date" | "evaluation_anniversary" | "birth_date">>) => {
    const current = memberDetails.find((item) => item.member_id === member.id);
    const updated: TeamMemberPrivateDetails = { member_id: member.id, store_id: member.store_id, hire_date: current?.hire_date ?? null, rehire_date: current?.rehire_date ?? null, evaluation_anniversary: current?.evaluation_anniversary ?? null, birth_date: current?.birth_date ?? null, ...changes };
    setMemberDetails((rows) => [...rows.filter((item) => item.member_id !== member.id), updated]);
    if (supabase && member.store_id !== demoStore.id) {
      const { error: detailsError } = await supabase.from("team_member_private_details").upsert({ ...updated, created_by: profile.id, updated_by: profile.id, updated_at: new Date().toISOString() });
      if (detailsError) { setError(detailsError.message); return; }
    }
    setMessage(`${member.display_name}’s employment dates saved.`);
  };
  const toggleAnniversaryOverride = async (member: TeamMember, enabled: boolean) => {
    setAnniversaryOverrideMembers((current) => { const next = new Set(current); if (enabled) next.add(member.id); else next.delete(member.id); return next; });
    if (!enabled) await updatePrivateDetails(member, { evaluation_anniversary: null });
  };
  const addPosition = async () => {
    const member = members.find((item) => item.id === positionMemberId);
    const name = positionDraft.position_name.trim();
    if (!member || !name) { setError("Choose an employee and enter a payroll position."); return; }
    const parsedRate = positionDraft.hourly_rate === "" ? null : Number(positionDraft.hourly_rate);
    if (parsedRate !== null && (!Number.isFinite(parsedRate) || parsedRate < 0)) { setError("Enter a valid hourly rate."); return; }
    const payload = { member_id: member.id, store_id: member.store_id, position_name: name, hourly_rate: parsedRate, effective_date: positionDraft.effective_date, active: true, created_by: profile.id, updated_by: profile.id, updated_at: new Date().toISOString() };
    if (!supabase || member.store_id === demoStore.id) {
      setMemberPositions((current) => [...current, { ...payload, id: `position-${Date.now()}` }]);
    } else {
      const { data, error: positionError } = await supabase.from("team_member_positions").insert(payload).select("id,member_id,store_id,position_name,hourly_rate,effective_date,active").single();
      if (positionError) { setError(positionError.message); return; }
      setMemberPositions((current) => [...current, data as TeamMemberPosition]);
    }
    setPositionDraft({ position_name: "", hourly_rate: "", effective_date: localTodayIso() });
    setMessage(`${name} pay assignment added for ${member.display_name}.`);
  };
  const deactivatePosition = async (position: TeamMemberPosition) => {
    if (supabase && position.store_id !== demoStore.id) {
      const { error: positionError } = await supabase.from("team_member_positions").update({ active: false, updated_by: profile.id, updated_at: new Date().toISOString() }).eq("id", position.id);
      if (positionError) { setError(positionError.message); return; }
    }
    setMemberPositions((current) => current.filter((item) => item.id !== position.id));
  };
  const deactivateTeamMember = async (member: TeamMember) => {
    await openStatusEditor(member);
  };

  const openStatusEditor = async (member: TeamMember) => {
    setStatusMember(member);
    setStatusDraft({ status: member.employment_status, effective_date: member.status_effective_date || localTodayIso(), reason: member.status_reason || "", notes: member.status_notes || "", home_store_id: member.home_store_id || "", hr_action_id: member.linked_hr_action_id || "" });
    setTerminationRecords([]);
    if (supabase && member.store_id !== demoStore.id) {
      const { data } = await supabase.from("hr_disciplinary_actions").select("id,employee_name,incident_date,incident_summary").eq("store_id", member.store_id).eq("action_type", "termination").or(`member_id.eq.${member.id},employee_name.ilike.${member.display_name.replace(/[%_,]/g, "")}`).order("incident_date", { ascending: false });
      setTerminationRecords((data ?? []) as TerminationRecord[]);
    }
  };

  const saveEmploymentStatus = async () => {
    if (!statusMember) return;
    if ((statusDraft.status === "on_leave" || statusDraft.status === "terminated") && !statusDraft.reason.trim()) { setError("Enter the leave or termination reason."); return; }
    if (statusDraft.status === "terminated" && !statusDraft.hr_action_id && !statusDraft.notes.trim()) { setError("Link a termination report or enter termination notes."); return; }
    if (statusDraft.status === "borrowed" && !statusDraft.home_store_id) { setError("Choose the borrowed employee’s home store."); return; }
    if (statusDraft.status !== "active" && shifts.some((shift) => shift.assigned_member_id === statusMember.id)) { setError("Remove this employee from the selected week’s shifts before changing them to a non-schedulable status."); return; }
    let linkedActionId = statusDraft.status === "terminated" ? statusDraft.hr_action_id : "";
    if (supabase && statusMember.store_id !== demoStore.id && statusDraft.status === "terminated") {
      if (!linkedActionId) {
        const { data: generatedAction, error: actionError } = await supabase.from("hr_disciplinary_actions").insert({ store_id: statusMember.store_id, member_id: statusMember.id, employee_name: statusMember.display_name, employee_identifier: null, incident_date: statusDraft.effective_date, action_type: "termination", policy_categories: ["other"], incident_summary: statusDraft.reason.trim(), action_taken: statusDraft.notes.trim() || "Employment terminated.", expectations: "", follow_up_date: null, witnesses: "", acknowledgment_status: "not_required", status: "completed", confidential_notes: statusDraft.notes.trim(), submitted_by: profile.id, submitted_by_name: profile.fullName }).select("id").single();
        if (actionError || !generatedAction) { setError(actionError?.message || "The termination report could not be created."); return; }
        linkedActionId = generatedAction.id;
        setStatusDraft((current) => ({ ...current, hr_action_id: linkedActionId }));
      }
      const notification = await supabase.functions.invoke("termination-notifications", { body: { action_id: linkedActionId, member_id: statusMember.id } });
      if (notification.error) { setError("The termination report was saved, but roster processing or the test HR email failed. An administrator should review it before retrying."); return; }
    }
    const updated: TeamMember = { ...statusMember, employment_status: statusDraft.status, active: statusDraft.status === "active" || statusDraft.status === "borrowed", home_store_id: statusDraft.status === "borrowed" ? statusDraft.home_store_id : null, status_reason: statusDraft.reason.trim(), status_effective_date: statusDraft.effective_date, status_notes: statusDraft.notes.trim(), linked_hr_action_id: linkedActionId || null };
    if (supabase && statusMember.store_id !== demoStore.id && statusDraft.status !== "terminated") {
      const { error: updateError } = await supabase.from("labor_team_members").update({ employment_status: updated.employment_status, active: updated.active, home_store_id: updated.home_store_id, status_reason: updated.status_reason, status_effective_date: updated.status_effective_date, status_notes: updated.status_notes, linked_hr_action_id: updated.linked_hr_action_id, status_changed_by: profile.id, status_changed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", statusMember.id);
      if (updateError) { setError(updateError.message); return; }
    }
    if (updated.active) {
      setMembers((current) => [...current.filter((item) => item.id !== updated.id), updated].sort((left, right) => left.display_name.localeCompare(right.display_name)));
      setInactiveMembers((current) => current.filter((item) => item.id !== updated.id));
    } else {
      setMembers((current) => current.filter((item) => item.id !== updated.id));
      setInactiveMembers((current) => [...current.filter((item) => item.id !== updated.id), updated].sort((left, right) => left.display_name.localeCompare(right.display_name)));
    }
    setStatusMember(null); setError(""); setMessage(`${updated.display_name} is now marked ${updated.employment_status.replace("_", " ")}. The prior status remains in permanent history.`);
  };
  const saveAvailability = async () => {
    if (!availabilityForm.member_id) { setError("Select an employee first."); return; }
    const isStandard = availabilityForm.kind === "standard";
    const allDay = isStandard ? availabilityForm.standard_status !== "limited" : availabilityForm.all_day;
    const startTime = allDay ? "00:00" : availabilityForm.start_time;
    const endTime = allDay ? "23:59" : availabilityForm.end_time;
    if (!allDay && (startTime === endTime || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime))) { setError("Choose a valid availability time range."); return; }
    const available = isStandard ? availabilityForm.standard_status !== "unavailable" : false;
    setError("");
    const baseEntry: Availability = { member_id: availabilityForm.member_id, day_of_week: availabilityForm.day_of_week, start_time: startTime, end_time: endTime, available, kind: availabilityForm.kind, week_start: isStandard ? undefined : weekStart, reason: isStandard ? undefined : availabilityForm.reason.trim() };
    if (!supabase || storeId === demoStore.id) {
      setAvailability((current) => [...current.filter((item) => !(item.member_id === baseEntry.member_id && item.day_of_week === baseEntry.day_of_week && item.kind === baseEntry.kind)), { ...baseEntry, id: `availability-${Date.now()}` }]);
    } else if (isStandard) {
      const { error: deleteError } = await supabase.from("labor_standard_availability").delete().eq("store_id", storeId).eq("member_id", baseEntry.member_id).eq("day_of_week", baseEntry.day_of_week);
      if (deleteError) { setError(deleteError.message); return; }
      const { data, error: insertError } = await supabase.from("labor_standard_availability").insert({ store_id: storeId, member_id: baseEntry.member_id, day_of_week: baseEntry.day_of_week, start_time: startTime, end_time: endTime, available }).select("id,member_id,day_of_week,start_time,end_time,available").single();
      if (insertError) { setError(insertError.message); return; }
      setAvailability((current) => [...current.filter((item) => !(item.member_id === baseEntry.member_id && item.day_of_week === baseEntry.day_of_week && item.kind === "standard")), { ...data, kind: "standard" } as Availability]);
    } else {
      const { error: deleteError } = await supabase.from("labor_time_off").delete().eq("store_id", storeId).eq("member_id", baseEntry.member_id).eq("week_start", weekStart).eq("day_of_week", baseEntry.day_of_week);
      if (deleteError) { setError(deleteError.message); return; }
      const { data, error: insertError } = await supabase.from("labor_time_off").insert({ store_id: storeId, member_id: baseEntry.member_id, week_start: weekStart, day_of_week: baseEntry.day_of_week, start_time: startTime, end_time: endTime, reason: availabilityForm.reason.trim() }).select("id,member_id,week_start,day_of_week,start_time,end_time,reason").single();
      if (insertError) { setError(insertError.message); return; }
      setAvailability((current) => [...current.filter((item) => !(item.member_id === baseEntry.member_id && item.day_of_week === baseEntry.day_of_week && item.kind === "rto")), { ...data, available: false, kind: "rto" } as Availability]);
    }
    const employee = members.find((member) => member.id === baseEntry.member_id)?.display_name || "Employee";
    setMessage(isStandard ? `${employee}’s recurring ${days[baseEntry.day_of_week]} availability saved.` : `${employee}’s requested time off saved for ${days[baseEntry.day_of_week]} of the selected week.`);
  };
  const clearAvailability = async () => {
    if (!availabilityForm.member_id) return;
    const isStandard = availabilityForm.kind === "standard";
    if (supabase && storeId !== demoStore.id) {
      let query = supabase.from(isStandard ? "labor_standard_availability" : "labor_time_off").delete().eq("store_id", storeId).eq("member_id", availabilityForm.member_id).eq("day_of_week", availabilityForm.day_of_week);
      if (!isStandard) query = query.eq("week_start", weekStart);
      const { error: deleteError } = await query;
      if (deleteError) { setError(deleteError.message); return; }
    }
    setAvailability((current) => current.filter((item) => !(item.member_id === availabilityForm.member_id && item.day_of_week === availabilityForm.day_of_week && item.kind === availabilityForm.kind)));
    setMessage(isStandard ? "Recurring restriction cleared; this employee is available by default." : "Requested time off cleared for the selected week.");
  };
  const chooseAvailability = (memberId: string, day: number, kind: "standard" | "rto") => {
    const entry = availability.find((item) => item.member_id === memberId && item.day_of_week === day && item.kind === kind);
    const fullDay = !entry || (entry.start_time.slice(0, 5) === "00:00" && entry.end_time.slice(0, 5) === "23:59");
    setAvailabilityForm((current) => ({ ...current, member_id: memberId, day_of_week: day, kind, standard_status: !entry ? "available" : !entry.available ? "unavailable" : fullDay ? "available" : "limited", all_day: fullDay, start_time: entry?.start_time.slice(0, 5) || "10:00", end_time: entry?.end_time.slice(0, 5) || "23:00", reason: entry?.reason || "" }));
  };
  const resetAssignments = async () => {
    if (!window.confirm("Clear every employee assignment for this week? Shift times will remain.")) return;
    setShifts((current) => current.map((shift) => ({ ...shift, assigned_member_id: null })));
    if (supabase && planId && planId !== "demo-plan") {
      const { error: updateError } = await supabase.from("labor_shifts").update({ assigned_member_id: null, updated_at: new Date().toISOString() }).eq("week_plan_id", planId);
      if (updateError) setError(updateError.message); else { await returnPlanToDraft(); setMessage("Schedule assignments cleared."); }
    }
  };
  const publish = async () => {
    if (!planId) { setError("Create or generate this week before publishing."); return; }
    if (!supabase || planId === "demo-plan") { setPlanStatus("published"); setMessage("Demo schedule published."); return; }
    const snapshot = { store: selectedStore?.name, week_start: weekStart, projections, shifts, shift_changes: shiftChanges, members, scheduling_events: weekEvents, published_by_name: profile.fullName };
    const { error: publicationError } = await supabase.from("labor_schedule_publications").insert({ week_plan_id: planId, store_id: storeId, week_start: weekStart, published_by: profile.id, snapshot });
    if (publicationError) { setError(publicationError.message); return; }
    await supabase.from("labor_week_plans").update({ status: "published", published_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", planId);
    setPlanStatus("published"); setMessage("Schedule published and saved to history.");
  };
  const saveSettings = async () => {
    if (!supabase) { setMessage("Demo settings saved locally."); return; }
    const [settingsResult, hoursResult] = await Promise.all([
      supabase.from("labor_store_settings").upsert({ store_id: storeId, ...settings, minor_break_after_hours: minorShiftLimit, updated_at: new Date().toISOString() }),
      supabase.from("labor_store_hours").upsert(storeHours.map((item) => ({ store_id: storeId, ...item })), { onConflict: "store_id,day_of_week" }),
    ]);
    const saveError = settingsResult.error || hoursResult.error;
    if (saveError) setError(saveError.message); else setMessage("Store labor settings and hours saved.");
  };
  const generateForecast = async (resetToDefault = false) => {
    setError(""); setMessage(""); setGeneratingForecast(true);
    if (!supabase) {
      setForecast({ id: "demo", confidence_score: 84, confidence_level: "high", confidence_reasons: ["34 comparable daylight baseline weeks", "Three demand metrics available", "Recent weekly results are current"], weekly_projection: { projected_sales: 28400, projected_orders: 1250, projected_oven_items: 1680, projected_deliveries: 510, low_sales: 26980, high_sales: 29820 }, method_version: "demand-v1", created_at: new Date().toISOString() });
      setMessage("Demo demand forecast generated."); setGeneratingForecast(false); return;
    }
    const target = weeklySalesTarget.trim() === "" ? null : Number(weeklySalesTarget);
    if (target !== null && (!Number.isFinite(target) || target <= 0)) { setError("Enter a valid weekly sales target or leave it blank for the engine recommendation."); setGeneratingForecast(false); return; }
    const { data, error: invokeError } = await supabase.functions.invoke("forecast-engine", { body: { action: "generate", store_id: storeId, week_start: weekStart, weekly_sales_target: target, reset_to_default: resetToDefault } });
    if (invokeError || !data?.ok) { setError(data?.error || invokeError?.message || "The forecast could not be generated."); setGeneratingForecast(false); return; }
    const result = data.result as { run: ForecastRun; daily: Array<DayProjection & { forecast_run_id: string }>; intervals: DemandInterval[]; shifts: Shift[]; plan_id: string | null; published_plan_preserved: boolean; edited_plan_preserved: boolean; rebuild_summary?: { preserved_shifts: number; replaced_system_shifts: number; added_system_shifts: number; deletion_protected_groups: number } };
    setForecast(result.run); setProjections(result.daily); setDemandIntervals(result.intervals ?? []); setShifts(result.shifts ?? []); if (result.plan_id) setPlanId(result.plan_id);
    const summary = result.rebuild_summary;
    setMessage(resetToDefault ? "Schedule reset to the default automated plan. Manager-added shifts, edits, assignments, and deletion protections were removed." : result.published_plan_preserved ? "Forecast generated. The already-published schedule was preserved." : summary && result.edited_plan_preserved ? `Rebuild complete. Preserved ${summary.preserved_shifts} custom, edited, or assigned shift${summary.preserved_shifts === 1 ? "" : "s"}; replaced ${summary.replaced_system_shifts} untouched automated shift${summary.replaced_system_shifts === 1 ? "" : "s"}; and added ${summary.added_system_shifts} shift${summary.added_system_shifts === 1 ? "" : "s"} around the manager's work.${summary.deletion_protected_groups ? ` ${summary.deletion_protected_groups} day/role section${summary.deletion_protected_groups === 1 ? "" : "s"} with an explicit deletion remained untouched.` : ""}` : result.edited_plan_preserved ? "Forecast updated. Manager work was preserved and the remaining coverage was rebuilt around it." : "All seven days of minimum required shifts were generated automatically from historical demand, recent trends, store settings, and scheduled events.");
    setGeneratingForecast(false);
  };
  const resetToDefault = async () => {
    if (!forecast || planStatus === "published") { setError(planStatus === "published" ? "Return the published schedule to draft before resetting it." : "Build the required shifts before resetting them."); return; }
    if (!window.confirm("Reset this entire week to the default automated schedule? This removes every manager-added shift, time edit, employee assignment, and deletion override.")) return;
    if (window.prompt('Type RESET to permanently remove the manager changes for this week.') !== "RESET") { setMessage("Reset cancelled. No schedule work was changed."); return; }
    await generateForecast(true);
  };
  const saveQuickAdjustment = async () => {
    const enteredValue = Number(quickAdjustment.value);
    if (!Number.isFinite(enteredValue)) { setError("Enter a valid projection adjustment."); return; }
    if (!quickAdjustment.all_day && (!quickAdjustment.start_time || !quickAdjustment.end_time || quickAdjustment.start_time === quickAdjustment.end_time)) { setError("Choose a valid start and end time for the adjustment."); return; }
    const intervalRange = shiftMinuteRange({ start_time: quickAdjustment.start_time, end_time: quickAdjustment.end_time });
    const selectedIntervals = demandIntervals.filter((row) => {
      if (row.day_of_week !== quickAdjustment.day_of_week) return false;
      if (quickAdjustment.all_day) return true;
      let minute = timeToMinutes(row.interval_start);
      if (intervalRange.end > 1440 && minute < intervalRange.start) minute += 1440;
      return minute >= intervalRange.start && minute < intervalRange.end;
    });
    const intervalSales = selectedIntervals.reduce((sum, row) => sum + Number(row.projected_sales || 0), 0);
    const daySales = Number(projections.find((row) => row.day_of_week === quickAdjustment.day_of_week)?.projected_sales || 0);
    const currentSales = quickAdjustment.all_day ? (intervalSales || daySales) : intervalSales;
    if (quickAdjustment.method !== "percent" && currentSales <= 0) { setError("Build this week's projection before using a dollar adjustment."); return; }
    const percent = quickAdjustment.method === "percent" ? enteredValue
      : quickAdjustment.method === "add_dollars" ? (enteredValue / currentSales) * 100
      : ((enteredValue / currentSales) - 1) * 100;
    if (!Number.isFinite(percent) || percent < -100 || percent > 500) { setError("This adjustment must keep demand between −100% and +500% of the current projection."); return; }
    const date = addIsoDays(weekStart, quickAdjustment.day_of_week);
    const methodDescription = quickAdjustment.method === "percent" ? `${enteredValue >= 0 ? "+" : ""}${enteredValue}%`
      : quickAdjustment.method === "add_dollars" ? `${enteredValue >= 0 ? "+" : "−"}$${Math.abs(enteredValue).toLocaleString()}`
      : `set to $${enteredValue.toLocaleString()}`;
    const payload = {
      scope: "store", store_id: storeId, name: quickAdjustment.label.trim() || `${days[quickAdjustment.day_of_week]} projection adjustment`, category: "operations",
      start_date: date, end_date: date, all_day: quickAdjustment.all_day, start_time: quickAdjustment.all_day ? null : quickAdjustment.start_time,
      end_time: quickAdjustment.all_day ? null : quickAdjustment.end_time, recurrence: "none", status: "active", impact_mode: "manual",
      sales_lift_percent: percent, order_count_lift_percent: percent, oven_items_lift_percent: percent, delivery_lift_percent: percent,
      notes: `Quick scheduler adjustment: ${methodDescription}; calculated ${percent >= 0 ? "+" : ""}${percent.toFixed(2)}% across sales and workload from a $${currentSales.toFixed(2)} starting projection.`, created_by: profile.id, updated_by: profile.id,
    };
    if (!supabase) { setMessage("Demo projection adjustment saved."); return; }
    const { data, error: saveError } = await supabase.from("labor_scheduling_events").insert(payload).select("*").single();
    if (saveError || !data) { setError(saveError?.message || "The projection adjustment could not be saved."); return; }
    setEvents((current) => [...current, data as SchedulingEvent]); setQuickAdjustment({ day_of_week: quickAdjustment.day_of_week, all_day: true, start_time: "16:00", end_time: "18:00", method: quickAdjustment.method, value: "", label: "" });
    await generateForecast();
  };
  const reuseEvent = (event: SchedulingEvent) => {
    const duration = Math.max(0, Math.round((new Date(`${event.end_date}T12:00:00`).getTime() - new Date(`${event.start_date}T12:00:00`).getTime()) / 86400000));
    setEventForm({ ...event, id: "", store_id: event.scope === "company" ? "" : storeId, start_date: weekStart, end_date: addIsoDays(weekStart, duration), status: "active", sales_lift_percent: event.sales_lift_percent?.toString() ?? "", order_count_lift_percent: event.order_count_lift_percent?.toString() ?? "", oven_items_lift_percent: event.oven_items_lift_percent?.toString() ?? "", delivery_lift_percent: event.delivery_lift_percent?.toString() ?? "" });
    setView("events"); setMessage(`Copied “${event.name}” into the selected week. Review the dates and save it to reuse the event.`);
  };
  const saveOutlierDecision = async (row: DemandInterval, scope: "week" | "recurring", handling: "timed_order" | "ignore_staffing" | "keep_full") => {
    if (!supabase) { setMessage("Timed-order choice saved for this demo session."); return; }
    const key = `${row.day_of_week}-${row.interval_start}-${scope}-${handling}`;
    setSavingOutlier(key); setError(""); setMessage("");
    let removal = supabase.from("labor_interval_adjustments").delete().eq("store_id", storeId).eq("scope", scope).eq("day_of_week", row.day_of_week).eq("interval_start", row.interval_start);
    removal = scope === "week" ? removal.eq("week_start", weekStart) : removal.is("week_start", null);
    const { error: removalError } = await removal;
    if (removalError) { setError(removalError.message); setSavingOutlier(""); return; }
    const { error: saveError } = await supabase.from("labor_interval_adjustments").insert({
      store_id: storeId, scope, week_start: scope === "week" ? weekStart : null,
      day_of_week: row.day_of_week, interval_start: row.interval_start,
      handling, prep_minutes: 90, created_by: profile.id, created_by_name: profile.fullName,
    });
    if (saveError) { setError(saveError.message); setSavingOutlier(""); return; }
    await generateForecast();
    setMessage(handling === "timed_order"
      ? `Timed order saved ${scope === "recurring" ? "as a recurring pattern" : "for this week"}. Excess production was moved into the prior 90-minute prep window and required shifts were rebuilt.`
      : handling === "ignore_staffing"
        ? `The isolated spike is now ignored for staffing ${scope === "recurring" ? "as a recurring pattern" : "for this week"}. Nearby demand remains in the forecast and required shifts were rebuilt.`
        : "Full staffing was retained for this demand spike and the decision was recorded.");
    setSavingOutlier("");
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
    if (eventForm.scope === "company" && !canCreateCompanyEvent) { setError("Only District Managers and administrators can create company-wide events."); return; }
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
  const selectedAvailabilityEntry = availability.find((item) => item.member_id === availabilityForm.member_id && item.day_of_week === availabilityForm.day_of_week && item.kind === availabilityForm.kind);
  const shiftPrintStatus = (shift: Shift) => {
    const changes = shiftChanges.filter((change) => change.shift_id === shift.id);
    if (changes.some((change) => change.change_type === "manual_added")) return "added" as const;
    if (changes.some((change) => change.change_type === "time_edited")) return "adjusted" as const;
    return shift.source === "manual" ? "added" as const : "system" as const;
  };
  const printableRows = (["manager", "insider", "driver"] as LaborRole[]).map((role) => {
    const roleShifts = shifts.filter((shift) => shift.role === role);
    const assignedIds = consolidatePrint
      ? members
        .filter((member) => shifts.some((shift) => shift.assigned_member_id === member.id))
        .filter((member) => (["manager", "insider", "driver"] as LaborRole[]).find((candidate) => member.qualified_roles.includes(candidate)) === role)
        .map((member) => member.id)
      : [...new Set(roleShifts.map((shift) => shift.assigned_member_id).filter((id): id is string => Boolean(id)))];
    const assignedRows = assignedIds.map((memberId) => ({
      key: `${role}-${memberId}`,
      name: members.find((member) => member.id === memberId)?.display_name || "Inactive employee",
      shifts: (consolidatePrint ? shifts : roleShifts).filter((shift) => shift.assigned_member_id === memberId),
    })).sort((left, right) => left.name.localeCompare(right.name));
    const openShiftsByDay = days.map((_, dayIndex) => roleShifts.filter((shift) => !shift.assigned_member_id && shift.day_of_week === dayIndex).sort((left, right) => left.start_time.localeCompare(right.start_time)));
    const openRows = Array.from({ length: Math.max(0, ...openShiftsByDay.map((dayShifts) => dayShifts.length)) }, (_, index) => ({
      key: `${role}-open-${index}`,
      name: `OPEN SHIFT ${index + 1}`,
      shifts: openShiftsByDay.flatMap((dayShifts) => dayShifts[index] ? [dayShifts[index]] : []),
    }));
    return { role, rows: [...assignedRows, ...openRows] };
  });
  const roleDayHours = (role: LaborRole, day: number) => shifts.filter((shift) => shift.role === role && shift.day_of_week === day).reduce((sum, shift) => sum + shiftHours(shift), 0);
  const requiredRoleDayHours = (role: LaborRole, day: number) => demandIntervals.filter((interval) => interval.day_of_week === day).reduce((sum, interval) => sum + Number(interval[`required_${role}s` as "required_managers" | "required_insiders" | "required_drivers"] || 0) * .25, 0);
  const openLandscapePdf = async () => {
    const sheet = schedulePrintRef.current;
    if (!sheet || exportingPdf) return;
    const previewWindow = window.open("", "_blank");
    if (previewWindow) {
      previewWindow.document.title = "Preparing schedule PDF";
      previewWindow.document.body.innerHTML = '<p style="font:600 16px Arial;padding:24px">Preparing your landscape schedule…</p>';
    }
    setExportingPdf(true);
    setError("");
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
      const canvas = await html2canvas(sheet, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: Math.max(1360, sheet.scrollWidth),
        onclone: (documentClone) => {
          const clonedSheet = documentClone.querySelector<HTMLElement>(".schedule-print-sheet");
          if (clonedSheet) {
            clonedSheet.style.width = "1360px";
            clonedSheet.style.maxWidth = "none";
            clonedSheet.style.margin = "0";
            clonedSheet.style.boxShadow = "none";
          }
        },
      });
      const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter", compress: true });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 18;
      const imageWidth = pageWidth - margin * 2;
      const imageScale = imageWidth / canvas.width;
      const maximumSliceHeight = Math.floor((pageHeight - margin * 2) / imageScale);
      const sheetRect = sheet.getBoundingClientRect();
      const canvasScale = canvas.height / Math.max(1, sheet.scrollHeight);
      const rowBreaks = Array.from(sheet.querySelectorAll("tr, .schedule-print-footer"))
        .map((element) => Math.round((element.getBoundingClientRect().bottom - sheetRect.top) * canvasScale))
        .filter((position) => position > 0 && position < canvas.height)
        .sort((left, right) => left - right);
      let sourceY = 0;
      let pageIndex = 0;
      while (sourceY < canvas.height) {
        const idealEnd = Math.min(canvas.height, sourceY + maximumSliceHeight);
        const safeBreaks = rowBreaks.filter((position) => position > sourceY + maximumSliceHeight * .55 && position <= idealEnd);
        const sourceEnd = idealEnd === canvas.height ? canvas.height : (safeBreaks.at(-1) || idealEnd);
        const sliceHeight = Math.max(1, sourceEnd - sourceY);
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = sliceHeight;
        slice.getContext("2d")?.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
        if (pageIndex > 0) pdf.addPage("letter", "landscape");
        pdf.addImage(slice.toDataURL("image/jpeg", .94), "JPEG", margin, margin, imageWidth, sliceHeight * imageScale, undefined, "FAST");
        sourceY = sourceEnd;
        pageIndex += 1;
      }
      const filename = `${(selectedStore?.name || "Store").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}-${weekStart}-schedule.pdf`;
      const url = URL.createObjectURL(pdf.output("blob"));
      if (previewWindow) {
        previewWindow.location.href = url;
        window.setTimeout(() => URL.revokeObjectURL(url), 120000);
      } else {
        pdf.save(filename);
        URL.revokeObjectURL(url);
      }
      setMessage("Landscape schedule PDF created. It is ready to review and print.");
    } catch (pdfError) {
      previewWindow?.close();
      setError(pdfError instanceof Error ? pdfError.message : "The landscape schedule PDF could not be created.");
    } finally {
      setExportingPdf(false);
    }
  };

  const outlierDecisionKey = (row: DemandInterval, scope: "week" | "recurring", handling: "timed_order" | "ignore_staffing" | "keep_full") => `${row.day_of_week}-${row.interval_start}-${scope}-${handling}`;
  const outlierDecisionActions = (row: DemandInterval) => (
    <div className="outlier-choice-grid">
      <button disabled={Boolean(savingOutlier)} onClick={() => void saveOutlierDecision(row, "week", "timed_order")}>{savingOutlier === outlierDecisionKey(row, "week", "timed_order") ? "Saving…" : "Prep early · this week"}</button>
      <button disabled={Boolean(savingOutlier)} onClick={() => void saveOutlierDecision(row, "recurring", "timed_order")}>{savingOutlier === outlierDecisionKey(row, "recurring", "timed_order") ? "Saving…" : "Prep early · recurring"}</button>
      <button className="ignore-staffing" disabled={Boolean(savingOutlier)} onClick={() => void saveOutlierDecision(row, "week", "ignore_staffing")}>{savingOutlier === outlierDecisionKey(row, "week", "ignore_staffing") ? "Saving…" : "Ignore for staffing · this week"}</button>
      <button className="ignore-staffing" disabled={Boolean(savingOutlier)} onClick={() => void saveOutlierDecision(row, "recurring", "ignore_staffing")}>{savingOutlier === outlierDecisionKey(row, "recurring", "ignore_staffing") ? "Saving…" : "Ignore for staffing · recurring"}</button>
      <button className="keep-full" disabled={Boolean(savingOutlier)} onClick={() => void saveOutlierDecision(row, "week", "keep_full")}>{savingOutlier === outlierDecisionKey(row, "week", "keep_full") ? "Saving…" : "Keep full staffing"}</button>
    </div>
  );
  const outlierReview = (row: DemandInterval) => {
    if (!row.oven_outlier_candidate) return <span className="outlier-none">—</span>;
    if (row.oven_outlier_status === "unreviewed") return <div className="outlier-actions"><strong>⚠ Likely timed order</strong><small>{Number(row.oven_outlier_original).toFixed(1)} items versus about {Number(row.oven_outlier_baseline).toFixed(1)} nearby</small>{outlierDecisionActions(row)}</div>;
    const ignored = row.oven_outlier_status.startsWith("ignored");
    const recurring = row.oven_outlier_status.endsWith("recurring");
    return <div className={`outlier-decision ${row.oven_outlier_status}`}>
      <strong>{row.oven_outlier_status === "keep_full" ? "Full staffing retained" : ignored ? `✓ Ignored for staffing${recurring ? " · recurring" : " · this week"}` : `✓ Timed order${recurring ? " · recurring" : " · this week"}`}</strong>
      {row.oven_outlier_status.startsWith("timed_order") && <small>Prepared across the prior {row.oven_prep_minutes || 90} minutes</small>}
      {ignored && <small>The isolated excess is excluded; nearby demand still determines staffing.</small>}
      <details className="outlier-change"><summary>Change decision</summary>{outlierDecisionActions(row)}</details>
    </div>;
  };

  return (
    <div className="page labor-page">
      <section className="page-heading heading-with-action labor-heading">
        <div><p className="eyebrow">Data-guided staffing</p><h1>Smart Scheduler</h1><p>Build the minimum schedule from current sales, oven-item, and delivery trends—then apply manager judgment before publishing.</p></div>
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
            <div><p className="eyebrow">Automatic weekly schedule</p><h2>Build minimum required shifts</h2><p>The engine uses historical sales, oven items, deliveries, recent trends, store settings, and scheduled events to create the minimum profitable staffing outline. Rebuilds preserve custom, edited, and assigned shifts, then fill uncovered demand around the manager’s work.</p></div>
            <div className="forecast-command-actions"><label>Approved weekly sales target <span>Optional</span><div className="kpi-input-affix prefix"><span>$</span><input type="number" min="1" step="1" value={weeklySalesTarget} onChange={(event) => setWeeklySalesTarget(event.target.value)} placeholder="Use engine recommendation" /></div></label><button className="button primary" onClick={() => void generateForecast()} disabled={generatingForecast || !storeId}><CalendarClock size={17} />{generatingForecast ? "Building shifts…" : forecast ? "Rebuild required shifts" : "Build required shifts"}</button><div className="auto-fill-command"><button className="button secondary" onClick={() => void autoFillScheduleNames()} disabled={autoFillingNames || generatingForecast || !forecast || (autoFillHistoryWeeks ?? 0) < 3 || shifts.every((shift) => shift.assigned_member_id)}><Users size={17} />{autoFillingNames ? "Suggesting names…" : "Auto-fill names"}</button><small>{autoFillHistoryWeeks === null ? "Checking published history…" : autoFillHistoryWeeks < 3 ? `${autoFillHistoryWeeks} of 3 published weeks available` : `Uses up to ${Math.min(12, autoFillHistoryWeeks)} published weeks · optional`}</small></div></div>
          </section>
          <section className="panel quick-projection-panel">
            <div><p className="eyebrow">Day or time adjustment</p><h2>Adjust a specific part of the week</h2><p>Change by percent, add or subtract sales dollars, or set a new total. Sales, oven items, orders, and deliveries move together, then required shifts rebuild around the new demand.</p></div>
            <div className="quick-projection-controls">
              <label>Day<select value={quickAdjustment.day_of_week} onChange={(event) => setQuickAdjustment({ ...quickAdjustment, day_of_week: Number(event.target.value) })}>{days.map((day, index) => <option key={day} value={index}>{day} · {formatScheduleDate(weekStart, index, true)}</option>)}</select></label>
              <label>Adjustment type<select value={quickAdjustment.method} onChange={(event) => setQuickAdjustment({ ...quickAdjustment, method: event.target.value as typeof quickAdjustment.method, value: "" })}><option value="percent">Change by percent</option><option value="add_dollars">Add / subtract dollars</option><option value="set_total">Set new projected total</option></select></label>
              <label>{quickAdjustment.method === "percent" ? "Percent change" : quickAdjustment.method === "add_dollars" ? "Sales dollars to add" : "New projected sales total"}<div className={quickAdjustment.method === "percent" ? "kpi-input-affix suffix" : "kpi-input-affix prefix"}>{quickAdjustment.method !== "percent" && <span>$</span>}<input type="number" step={quickAdjustment.method === "percent" ? "1" : "50"} value={quickAdjustment.value} onChange={(event) => setQuickAdjustment({ ...quickAdjustment, value: event.target.value })} placeholder={quickAdjustment.method === "percent" ? "20 or -100" : quickAdjustment.method === "add_dollars" ? "1000 or -500" : "5000"} />{quickAdjustment.method === "percent" && <span>%</span>}</div></label>
              <label>Reason<input value={quickAdjustment.label} onChange={(event) => setQuickAdjustment({ ...quickAdjustment, label: event.target.value })} placeholder="Thanksgiving, game, early close…" /></label>
              <label className="checkbox-line quick-all-day"><input type="checkbox" checked={quickAdjustment.all_day} onChange={(event) => setQuickAdjustment({ ...quickAdjustment, all_day: event.target.checked })} />Entire day</label>
              {!quickAdjustment.all_day && <><label>Starts<input type="time" step="900" value={quickAdjustment.start_time} onChange={(event) => setQuickAdjustment({ ...quickAdjustment, start_time: event.target.value })} /></label><label>Ends<input type="time" step="900" value={quickAdjustment.end_time} onChange={(event) => setQuickAdjustment({ ...quickAdjustment, end_time: event.target.value })} /></label></>}
              <button className="button secondary" onClick={() => void saveQuickAdjustment()} disabled={generatingForecast || !storeId}><CalendarClock size={17} />Apply &amp; rebuild</button>
            </div>
          </section>
          {forecast && <section className="forecast-confidence-panel"><div><span className={`forecast-confidence ${forecast.confidence_level}`}>{forecast.confidence_level} confidence · {Number(forecast.confidence_score).toFixed(0)}%</span><strong>${Number(forecast.weekly_projection.projected_sales).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong><small>Expected range ${Number(forecast.weekly_projection.low_sales).toLocaleString(undefined, { maximumFractionDigits: 0 })}–${Number(forecast.weekly_projection.high_sales).toLocaleString(undefined, { maximumFractionDigits: 0 })}</small></div><div className="forecast-volume-grid"><span><strong>{Math.round(forecast.weekly_projection.projected_orders).toLocaleString()}</strong> orders</span><span><strong>{Math.round(forecast.weekly_projection.projected_oven_items).toLocaleString()}</strong> oven items</span><span><strong>{Math.round(forecast.weekly_projection.projected_deliveries).toLocaleString()}</strong> deliveries</span></div><details><summary>Why this confidence level?</summary><ul>{forecast.confidence_reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></details></section>}
          <section className="labor-summary-grid"><article><span>Projected sales</span><strong>${weeklySales.toLocaleString()}</strong><small>Week of {formatWeek(weekStart)}</small></article><article><span>Scheduled hours</span><strong>{totalHours.toFixed(1)}</strong><small>{shifts.length} required shifts</small></article><article><span>Projected SPLH</span><strong>${weeklySplh.toFixed(2)}</strong><small>Sales ÷ scheduled hours</small></article><article><span>Status</span><strong className="labor-status">{planStatus}</strong><small>{shifts.filter((shift) => !shift.assigned_member_id).length} open shifts</small></article></section>
          {weekEvents.length > 0 && <section className="labor-event-strip"><CalendarDays size={20} /><div><strong>{weekEvents.length === 1 ? "Demand event this week" : `${weekEvents.length} demand events this week`}</strong><div>{weekEvents.map((event) => <button key={event.id} onClick={() => editEvent(event)}><span>{event.scope === "company" ? "Company" : selectedStore?.name}</span>{event.name}</button>)}</div></div></section>}
          <div className="labor-toolbar"><div className="day-tabs">{days.map((day, index) => <button key={day} className={selectedDay === index ? "active" : ""} onClick={() => setSelectedDay(index)}><span>{day.slice(0, 3)} <b>{formatScheduleDate(weekStart, index, true)}</b></span><small>{shifts.filter((shift) => shift.day_of_week === index).length} shifts</small></button>)}</div><div className="button-row"><button className="button secondary" onClick={resetAssignments}><RotateCcw size={17} />Reset names</button><button className="button secondary danger" onClick={() => void resetToDefault()} disabled={generatingForecast || !forecast || planStatus === "published"}><RotateCcw size={17} />Reset to default</button><button className="button secondary" onClick={() => setShowPrintPreview(true)} disabled={shifts.length === 0}><Printer size={17} />Print week</button><button className="button primary" onClick={publish}><FileDown size={17} />Publish</button></div></div>
          <section className="panel labor-day-panel"><div className="table-toolbar"><div><p className="eyebrow">{days[selectedDay]}, {formatScheduleDate(weekStart, selectedDay)} · Builder</p><h2>Required shifts</h2><p>Managers first, then insiders and drivers; each group is ordered by start time.</p></div><div className="labor-day-metrics"><span>${Number(daySales).toLocaleString()} sales</span><strong>${dayHours ? (Number(daySales) / dayHours).toFixed(2) : "0.00"} SPLH</strong><div className="builder-zoom-controls" aria-label="Daily builder zoom"><span>Table size</span>{([65, 80, 100] as const).map((value) => <button key={value} type="button" className={builderZoom === value ? "active" : ""} onClick={() => setBuilderZoom(value)}>{value}%</button>)}</div></div></div>
            <div className="manual-shift-builder"><div><strong>Add coverage</strong><small>Use 15-minute times. New shifts must follow the store’s minimum and maximum shift rules.</small></div><label>Role<select value={newShift.role} onChange={(event) => setNewShift({ ...newShift, role: event.target.value as LaborRole })}><option value="manager">Manager</option><option value="insider">Insider</option><option value="driver">Driver</option></select></label><label>Starts<input type="time" step="900" value={newShift.start_time} onChange={(event) => setNewShift({ ...newShift, start_time: event.target.value })} /></label><label>Ends<input type="time" step="900" value={newShift.end_time} onChange={(event) => setNewShift({ ...newShift, end_time: event.target.value })} /></label><button className="button secondary" onClick={() => void addManualShift()}><Plus size={17} />Add shift</button></div>
            {visibleShifts.length === 0 ? <div className="activity-empty">No suggested shifts have been generated for this day.</div> : <div className={`responsive-table daily-builder-table zoom-${builderZoom}`}><table className="labor-shift-table"><thead><tr><th>Role</th><th>Start</th><th>End</th><th>Hours</th><th>Assigned employee</th><th>Availability</th><th>Origin / changes</th><th aria-label="Shift actions" /></tr></thead><tbody>{visibleShifts.map((shift) => { const assigned = members.find((member) => member.id === shift.assigned_member_id); const needsBreak = Boolean(assigned?.is_minor && shiftHours(shift) > minorShiftLimit); const availabilityState = assigned ? memberStatus(assigned, shift) : ""; const status = assigned ? [availabilityState === "✓" ? "" : availabilityState, needsBreak ? "⚠ 30-minute break required" : ""].filter(Boolean).join(" · ") || "✓" : ""; const changes = shiftChanges.filter((change) => change.shift_id === shift.id); const lastChange = changes[0]; const originallyAutomated = shift.source === "suggested" || changes.some((change) => change.before_state?.source === "suggested"); return <tr key={shift.id} className={`${shift.role} ${shift.start_time <= "10:00" ? "opening" : ""} ${shift.end_time <= shift.start_time || shift.end_time >= "23:00" ? "closing" : ""} ${lastChange ? "shift-was-edited" : ""}`}><td data-label="Role"><strong>{shift.role[0].toUpperCase() + shift.role.slice(1)}</strong></td><td data-label="Start"><input className="shift-time-input" aria-label={`${shift.role} shift start`} type="time" step="900" value={shift.start_time.slice(0, 5)} onChange={(event) => void updateShiftTime(shift, "start_time", event.target.value)} /></td><td data-label="End"><input className="shift-time-input" aria-label={`${shift.role} shift end`} type="time" step="900" value={shift.end_time.slice(0, 5)} onChange={(event) => void updateShiftTime(shift, "end_time", event.target.value)} /></td><td data-label="Hours">{shiftHours(shift).toFixed(2)}</td><td data-label="Assigned employee"><select value={shift.assigned_member_id ?? ""} onChange={(event) => void assign(shift, event.target.value)}><option value="">Open shift</option>{members.filter((member) => member.qualified_roles.includes(shift.role)).map((member) => { const optionNeedsBreak = member.is_minor && shiftHours(shift) > minorShiftLimit; const optionAvailability = memberStatus(member, shift); return <option key={member.id} value={member.id}>{optionAvailability} {member.display_name}{member.is_minor ? ` · Minor${optionNeedsBreak ? " · ⚠ 30m break required" : ""}` : ""}</option>; })}</select></td><td data-label="Availability"><span className={status.includes("⛔") ? "availability-bad" : status.includes("⚠") ? "availability-warning" : "availability-good"}>{status || "—"}</span></td><td data-label="Origin / changes"><div className="shift-origin"><span className={lastChange ? "edited" : shift.source === "suggested" ? "generated" : "manual"}>{lastChange ? originallyAutomated ? "Automated · edited" : "Manual shift" : shift.source === "suggested" ? "System generated" : "Manual shift"}</span><small>{lastChange ? `${lastChange.changed_by_name} · ${new Date(lastChange.created_at).toLocaleString()}` : shift.notes}</small></div></td><td className="shift-actions" data-label="Actions"><button className="icon-button danger" aria-label={`Remove ${shift.role} shift`} title="Remove shift" onClick={() => void deleteShift(shift)}><Trash2 size={17} /></button></td></tr>; })}</tbody></table></div>}
            {shiftChanges.some((change) => change.day_of_week === selectedDay) && <details className="shift-change-history"><summary>View {days[selectedDay]} shift change history</summary><div>{shiftChanges.filter((change) => change.day_of_week === selectedDay).map((change) => <article key={change.id}><span className={change.change_type}>{change.change_type.replaceAll("_", " ")}</span><div><strong>{change.change_summary}</strong><small>{change.changed_by_name} · {new Date(change.created_at).toLocaleString()}</small></div></article>)}</div></details>}
          </section>
          {unreviewedOutliers.length > 0 && <div className="timed-order-alert"><AlertTriangle size={20} /><div><strong>{unreviewedOutliers.length} likely timed order{unreviewedOutliers.length === 1 ? "" : "s"} detected on {days[selectedDay]}</strong><span>Expand the 15-minute details below to confirm advance preparation or retain full staffing.</span></div></div>}
          <details className="panel labor-coverage-panel">
            <summary><div><p className="eyebrow">Optional diagnostic</p><h2>Advanced 15-minute coverage details</h2><small>Open only when you want to inspect how {days[selectedDay]} shifts match the projected demand.</small></div><div className="coverage-summary">{unreviewedOutliers.length > 0 && <span className="review">⚠ {unreviewedOutliers.length} needs review</span>}<span className={coverageGapIntervals ? "gap" : "covered"}>{coverageGapIntervals ? `${coverageGapIntervals} intervals with gaps` : "✓ Every interval covered"}</span><small>{coverageExactIntervals} exact-fit intervals</small></div></summary>
            {coverageRows.length === 0 ? <div className="activity-empty">Generate the forecast to create the interval staffing requirements.</div> : <><div className="coverage-table-guide"><strong>15-minute staffing detail</strong><span>Swipe sideways to compare demand, scheduled coverage, results, and timed-order decisions.</span></div><div className="responsive-table coverage-table-wrap"><table className="coverage-table"><thead><tr><th>Time</th><th>Sales</th><th>Oven</th><th>Deliveries</th><th>Managers<br /><small>Need / Scheduled</small></th><th>Insiders<br /><small>Need / Scheduled</small></th><th>Drivers<br /><small>Need / Scheduled</small></th><th>Result</th><th>Timed Order review</th></tr></thead><tbody>{coverageRows.map((row) => {
              const coverageCell = (role: LaborRole) => { const difference = row.scheduled[role] - row.required[role]; return <span className={difference < 0 ? "coverage-gap" : difference > 0 ? "coverage-extra" : "coverage-fit"}>{row.required[role]} / {row.scheduled[role]}</span>; };
              return <tr key={`${row.day_of_week}-${row.interval_start}`} className={`${row.gaps ? "has-gap" : row.excess ? "has-extra" : "is-covered"} ${row.oven_outlier_candidate ? "oven-outlier" : ""}`}><td><strong>{displayTime(row.interval_start)}</strong></td><td>${Number(row.projected_sales).toFixed(0)}</td><td>{Number(row.projected_oven_items).toFixed(1)}{row.oven_outlier_original !== null && (row.oven_outlier_status.startsWith("timed_order") || row.oven_outlier_status.startsWith("ignored")) && <small className="oven-original">was {Number(row.oven_outlier_original).toFixed(1)}</small>}</td><td>{Number(row.projected_deliveries).toFixed(1)}</td><td>{coverageCell("manager")}</td><td>{coverageCell("insider")}</td><td>{coverageCell("driver")}</td><td>{row.gaps ? <span className="coverage-result gap">Short {row.gaps}</span> : row.excess ? <span className="coverage-result extra">+{row.excess} above minimum</span> : <span className="coverage-result covered">Exact</span>}</td><td>{outlierReview(row)}</td></tr>;
            })}</tbody></table></div></>}
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
              return <article key={day} className="week-day-card"><h3>{day}<small>{formatScheduleDate(weekStart, dayIndex)}</small></h3>{periods.map((period) => <section key={period.key} className={`week-period ${period.key}`}><header><strong>{period.label}</strong><small>{period.timeLabel}</small></header>{(["manager", "insider", "driver"] as LaborRole[]).map((role) => {
                const periodShifts = shifts.filter((shift) => shift.day_of_week === dayIndex && shift.role === role && overlapMinutes(shift, period.start, period.end) > 0);
                const coverage = halfStepCoverage(periodShifts, period.start, period.end);
                return <div key={role} className="week-role-row"><div className="week-role-summary"><strong>{role}s</strong><b title="Average staffing coverage">{formatCoverage(coverage)}</b></div><div className="week-role-assignments">{periodShifts.length === 0 ? <span className="week-no-coverage">No coverage</span> : periodShifts.map((shift) => <span key={shift.id}>{members.find((member) => member.id === shift.assigned_member_id)?.display_name || "OPEN"}<small>{displayTime(shift.start_time)}–{displayTime(shift.end_time)}</small></span>)}</div></div>;
              })}</section>)}</article>;
            })}</div>
          </section>
          {showPrintPreview && <div className="modal-backdrop labor-print-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowPrintPreview(false); }}>
            <section className="labor-print-modal" role="dialog" aria-modal="true" aria-labelledby="labor-print-title">
              <div className="labor-print-actions no-print"><div><p className="eyebrow">Pre-publish review</p><h2 id="labor-print-title">Printable week at a glance</h2><p>Open the prepared landscape PDF, then print it or save it. Page size and orientation are set automatically.</p></div><label className="print-layout-option"><input type="checkbox" checked={consolidatePrint} onChange={(event) => setConsolidatePrint(event.target.checked)} /><span><strong>Consolidate team members</strong><small>Show each person once under their highest qualified role.</small></span></label><div className="button-row"><button className="button secondary" onClick={() => setShowPrintPreview(false)}><X size={17} />Close</button><button className="button primary" onClick={() => void openLandscapePdf()} disabled={exportingPdf}><Printer size={17} />{exportingPdf ? "Preparing PDF…" : "Open landscape PDF"}</button></div></div>
              <div className="schedule-print-sheet" ref={schedulePrintRef}>
                <header className="schedule-print-header"><div><p>Team Powers · DASH-OS</p><h1>{selectedStore?.name || "Store"} Weekly Schedule</h1><strong>{formatWeek(weekStart)} – {formatWeek(weekEnd)}</strong></div><div><span className={`print-plan-status ${planStatus}`}>{planStatus === "published" ? "Published" : "Draft · Not published"}</span><small>Prepared by {profile.fullName}</small><small>Printed {new Date().toLocaleString()}</small></div></header>
                <div className="print-change-legend"><strong>Shift key</strong><span className="system">System generated</span><span className="adjusted">✎ Adjusted</span><span className="added">+ Added</span><span className="open">OPEN = unassigned</span>{consolidatePrint && <><span className="role-key">(i) Insider</span><span className="role-key">(d) Driver</span></>}</div>
                <table className="schedule-print-table">
                  <thead><tr className="print-store-hours"><th>Store hours</th>{days.map((day, dayIndex) => { const hours = storeHours.find((item) => item.day_of_week === dayIndex); return <th key={day}>{hours ? `${displayTime(hours.open_time)}–${displayTime(hours.close_time)}` : "—"}</th>; })}<th rowSpan={2} className="print-week-hours">Week<br />hours</th></tr><tr><th>Employee</th>{days.map((day, dayIndex) => <th key={day}>{day}<small className="print-day-date">{formatScheduleDate(weekStart, dayIndex)}</small></th>)}</tr></thead>
                  <tbody>{printableRows.map(({ role, rows }) => <Fragment key={role}><tr className={`print-role-heading ${role}`}><th colSpan={9}>{role === "driver" ? "Delivery Experts" : `${role[0].toUpperCase()}${role.slice(1)}s`}</th></tr>{rows.length === 0 ? <tr><td className="print-empty-row">No {role} shifts</td>{days.map((day) => <td key={day}>—</td>)}<td>0.00</td></tr> : rows.map((row) => <tr key={row.key}><th>{row.name}</th>{days.map((day, dayIndex) => <td key={day}>{row.shifts.filter((shift) => shift.day_of_week === dayIndex).map((shift) => { const status = shiftPrintStatus(shift); const roleMarker = consolidatePrint && shift.assigned_member_id && shift.role !== role ? shift.role === "insider" ? " (i)" : shift.role === "driver" ? " (d)" : " (m)" : ""; return <span key={shift.id} className={`print-shift ${status}`}><b>{displayTime(shift.start_time)}–{displayTime(shift.end_time)}{roleMarker}</b>{status === "adjusted" ? <small>✎ Adjusted</small> : status === "added" ? <small>+ Added</small> : null}</span>; })}</td>)}<td className="print-hours-total">{row.shifts.reduce((sum, shift) => sum + shiftHours(shift), 0).toFixed(2)}</td></tr>)}<tr className="print-role-total"><th>Coverage needed</th>{days.map((day, dayIndex) => <td key={day}>{requiredRoleDayHours(role, dayIndex).toFixed(2)}</td>)}<td>{days.reduce((sum, _, dayIndex) => sum + requiredRoleDayHours(role, dayIndex), 0).toFixed(2)}</td></tr><tr className="print-role-total scheduled"><th>Hours scheduled</th>{days.map((day, dayIndex) => <td key={day}>{roleDayHours(role, dayIndex).toFixed(2)}</td>)}<td>{shifts.filter((shift) => shift.role === role).reduce((sum, shift) => sum + shiftHours(shift), 0).toFixed(2)}</td></tr></Fragment>)}
                    <tr className="print-grand-total"><th>Grand total hours</th>{days.map((day, dayIndex) => <td key={day}>{shifts.filter((shift) => shift.day_of_week === dayIndex).reduce((sum, shift) => sum + shiftHours(shift), 0).toFixed(2)}</td>)}<td>{totalHours.toFixed(2)}</td></tr>
                    <tr className="print-sales-total"><th>Forecast sales</th>{days.map((day, dayIndex) => <td key={day}>${Number(projections.find((projection) => projection.day_of_week === dayIndex)?.projected_sales || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>)}<td>${weeklySales.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td></tr>
                  </tbody>
                </table>
                <footer className="schedule-print-footer"><span>{shifts.filter((shift) => !shift.assigned_member_id).length} open shifts</span><span>{shiftChanges.filter((change) => change.change_type === "time_edited").length} shift adjustments</span><span>{shifts.filter((shift) => shiftPrintStatus(shift) === "added").length} added shifts</span><strong>Projected SPLH ${weeklySplh.toFixed(2)}</strong></footer>
              </div>
            </section>
          </div>}
        </>
      ) : view === "employees" ? (
        <div className="roster-layout">
          <section className="panel roster-add-panel">
            <div><p className="eyebrow">Scheduling roster</p><h2>Add an employee</h2><p>Hire date powers evaluation reminders. Birth year stays private and is never shown on the calendar.</p></div>
            <label>Employee name<input value={newMember.display_name} onChange={(event) => setNewMember({ ...newMember, display_name: event.target.value })} placeholder="First and last name" /></label>
            <div className="roster-date-fields"><label>Hire date<input type="date" value={newMember.hire_date} onChange={(event) => setNewMember({ ...newMember, hire_date: event.target.value })} /></label><label>Birthday<input type="date" value={newMember.birth_date} onChange={(event) => setNewMember({ ...newMember, birth_date: event.target.value })} /></label></div>
            <label className="anniversary-exception-toggle"><input type="checkbox" checked={newMember.anniversary_different} onChange={(event) => setNewMember({ ...newMember, anniversary_different: event.target.checked, evaluation_anniversary: event.target.checked ? newMember.evaluation_anniversary : "" })} /><span>Anniversary date different than hire date</span></label>
            {newMember.anniversary_different && <label className="anniversary-exception-date">Anniversary / evaluation start date<input type="date" value={newMember.evaluation_anniversary} onChange={(event) => setNewMember({ ...newMember, evaluation_anniversary: event.target.value })} /><small>Used for both the 90-day and annual evaluation schedule.</small></label>}
            <fieldset><legend>Qualified scheduling roles</legend>{(["manager", "insider", "driver"] as LaborRole[]).map((role) => <label key={role} className="checkbox-line"><input type="checkbox" checked={newMember.qualified_roles.includes(role)} onChange={(event) => setNewMember({ ...newMember, qualified_roles: event.target.checked ? [...newMember.qualified_roles, role] : newMember.qualified_roles.filter((item) => item !== role) })} />{role[0].toUpperCase() + role.slice(1)}</label>)}</fieldset>
            <label className="checkbox-line"><input type="checkbox" checked={newMember.is_minor} onChange={(event) => setNewMember({ ...newMember, is_minor: event.target.checked })} />Minor employee</label>
            <button className="button primary" onClick={() => void addTeamMember()}><Plus size={17} />Add to roster</button>
          </section>
          <section className="panel roster-list-panel">
            <div className="table-toolbar"><div><p className="eyebrow">Active employees</p><h2>Roster, employment dates, and position pay</h2><p>Hire date and birthday are optional and can be added later. Missing dates never block scheduling; hire dates only control automatic evaluation reminders.</p></div>{members.some((member) => !memberDetails.find((item) => item.member_id === member.id)?.hire_date) && <span className="roster-date-reminder">{members.filter((member) => !memberDetails.find((item) => item.member_id === member.id)?.hire_date).length} hire dates can be added later</span>}</div>
            {members.length === 0 ? <div className="activity-empty">No employees are currently available on this store’s scheduling roster.</div> : <div className="responsive-table"><table className="roster-table roster-employment-table"><thead><tr><th>Employee</th><th>Status</th><th>Scheduling roles</th><th>Hire date</th><th>Birthday</th><th>Position pay</th><th>Minor</th><th>Weekly hours</th><th>Flag</th><th aria-label="Roster actions" /></tr></thead><tbody>{hoursByMember.map(({ member, hours }) => { const details = memberDetails.find((item) => item.member_id === member.id); const positions = memberPositions.filter((item) => item.member_id === member.id); return <tr key={member.id}><td><input className="roster-name-input" value={member.display_name} onChange={(event) => setMembers((current) => current.map((item) => item.id === member.id ? { ...item, display_name: event.target.value } : item))} onBlur={(event) => void updateTeamMember(member, { display_name: event.target.value.trim() })} /></td><td><button type="button" className={`status-pill ${member.employment_status}`} onClick={() => void openStatusEditor(member)}>{member.employment_status === "borrowed" ? "Borrowed" : "Active"}</button></td><td><div className="roster-role-checks">{(["manager", "insider", "driver"] as LaborRole[]).map((role) => <label key={role}><input type="checkbox" checked={member.qualified_roles.includes(role)} onChange={(event) => void updateTeamMember(member, { qualified_roles: event.target.checked ? [...member.qualified_roles, role] : member.qualified_roles.filter((item) => item !== role) })} />{role[0].toUpperCase()}</label>)}</div></td><td><div className="roster-hire-date-cell"><input className="roster-date-input" type="date" value={details?.hire_date ?? ""} onChange={(event) => setMemberDetails((current) => [...current.filter((item) => item.member_id !== member.id), { member_id: member.id, store_id: member.store_id, hire_date: event.target.value || null, rehire_date: details?.rehire_date ?? null, evaluation_anniversary: details?.evaluation_anniversary ?? null, birth_date: details?.birth_date ?? null }])} onBlur={(event) => void updatePrivateDetails(member, { hire_date: event.target.value || null })} /><label className="anniversary-exception-toggle inline"><input type="checkbox" checked={Boolean(details?.evaluation_anniversary) || anniversaryOverrideMembers.has(member.id)} onChange={(event) => void toggleAnniversaryOverride(member, event.target.checked)} /><span>Different anniversary date</span></label>{(details?.evaluation_anniversary || anniversaryOverrideMembers.has(member.id)) && <label className="anniversary-exception-date inline"><span>Anniversary date</span><input type="date" value={details?.evaluation_anniversary ?? ""} onChange={(event) => setMemberDetails((current) => [...current.filter((item) => item.member_id !== member.id), { member_id: member.id, store_id: member.store_id, hire_date: details?.hire_date ?? null, rehire_date: details?.rehire_date ?? null, evaluation_anniversary: event.target.value || null, birth_date: details?.birth_date ?? null }])} onBlur={(event) => void updatePrivateDetails(member, { evaluation_anniversary: event.target.value || null })} /></label>}</div></td><td><input className="roster-date-input" type="date" value={details?.birth_date ?? ""} onChange={(event) => setMemberDetails((current) => [...current.filter((item) => item.member_id !== member.id), { member_id: member.id, store_id: member.store_id, hire_date: details?.hire_date ?? null, rehire_date: details?.rehire_date ?? null, evaluation_anniversary: details?.evaluation_anniversary ?? null, birth_date: event.target.value || null }])} onBlur={(event) => void updatePrivateDetails(member, { birth_date: event.target.value || null })} /></td><td><div className="position-pay-list">{positions.map((position) => <span key={position.id}>{position.position_name} · {position.hourly_rate == null ? "rate not entered" : `$${Number(position.hourly_rate).toFixed(2)}`}<button type="button" aria-label={`Remove ${position.position_name}`} onClick={() => void deactivatePosition(position)}>×</button></span>)}<button type="button" className="position-add-button" onClick={() => setPositionMemberId(member.id)}>+ position</button></div></td><td><label className="roster-minor-toggle"><input type="checkbox" checked={member.is_minor} onChange={(event) => void updateTeamMember(member, { is_minor: event.target.checked })} /><span>{member.is_minor ? "◆ Minor" : "Adult"}</span></label></td><td><strong>{hours.toFixed(2)}</strong></td><td>{hours >= 40 ? <span className="availability-bad">OVERTIME</span> : hours >= 36 ? <span className="availability-warning">Close to OT</span> : <span className="availability-good">✓ OK</span>}</td><td><button className="button secondary compact" aria-label={`Change ${member.display_name} status`} onClick={() => void deactivateTeamMember(member)}>Change status</button></td></tr>; })}</tbody></table></div>}
            <div className="table-toolbar inactive-roster-heading"><div><p className="eyebrow">Historical roster</p><h3>On leave, terminated, and archived</h3><p>These employees stay out of scheduling lists while their permanent history remains available.</p></div></div>
            {inactiveMembers.length === 0 ? <div className="activity-empty compact">No inactive roster records for this store.</div> : <div className="responsive-table"><table className="roster-table"><thead><tr><th>Employee</th><th>Status</th><th>Effective</th><th>Reason</th><th>HR record</th><th /></tr></thead><tbody>{inactiveMembers.map((member) => <tr key={member.id}><td><strong>{member.display_name}</strong></td><td><span className={`status-pill ${member.employment_status}`}>{member.employment_status.replace("_", " ")}</span></td><td>{member.status_effective_date ? formatWeek(member.status_effective_date) : "—"}</td><td>{member.status_reason || "—"}</td><td>{member.linked_hr_action_id ? "Linked" : "—"}</td><td><button type="button" className="button secondary compact" onClick={() => void openStatusEditor(member)}>Review / reactivate</button></td></tr>)}</tbody></table></div>}
          </section>
          {positionMemberId && <div className="modal-backdrop" onClick={() => setPositionMemberId("")}><section className="ticket-modal roster-position-editor" onClick={(event) => event.stopPropagation()}><button type="button" className="icon-button modal-close" onClick={() => setPositionMemberId("")}><X /></button><p className="eyebrow">Position-specific compensation</p><h2>{members.find((item) => item.id === positionMemberId)?.display_name}</h2><p>Add one entry for each payroll position. Updating an evaluation can later create a payroll change request without overwriting this history.</p><label>Payroll position<input value={positionDraft.position_name} onChange={(event) => setPositionDraft({ ...positionDraft, position_name: event.target.value })} placeholder="Assistant Manager, CSR, Driver…" /></label><div className="roster-date-fields"><label>Current hourly rate<input type="number" min="0" step="0.01" value={positionDraft.hourly_rate} onChange={(event) => setPositionDraft({ ...positionDraft, hourly_rate: event.target.value })} placeholder="Optional" /></label><label>Effective date<input type="date" value={positionDraft.effective_date} onChange={(event) => setPositionDraft({ ...positionDraft, effective_date: event.target.value })} /></label></div><div className="calendar-editor-actions"><button type="button" className="button secondary" onClick={() => setPositionMemberId("")}>Close</button><button type="button" className="button primary" onClick={() => void addPosition()}><Plus size={16}/>Add position</button></div></section></div>}
          {statusMember && <div className="modal-backdrop" onClick={() => setStatusMember(null)}><section className="ticket-modal roster-status-editor" onClick={(event) => event.stopPropagation()}><button type="button" className="icon-button modal-close" onClick={() => setStatusMember(null)}><X /></button><p className="eyebrow">Permanent roster history</p><h2>{statusMember.display_name}</h2><p>On-leave and terminated employees disappear from normal scheduling lists. Reactivating them preserves every prior status change.</p><label>Roster status<select value={statusDraft.status} onChange={(event) => setStatusDraft({ ...statusDraft, status: event.target.value as EmploymentStatus })}><option value="active">Active</option><option value="on_leave">On leave</option><option value="borrowed">Borrowed from another store</option><option value="terminated">Terminated</option><option value="archived">Archived / prior record</option></select></label><label>Effective date<input type="date" value={statusDraft.effective_date} onChange={(event) => setStatusDraft({ ...statusDraft, effective_date: event.target.value })} /></label>{statusDraft.status === "on_leave" && <label>Leave reason<select value={statusDraft.reason} onChange={(event) => setStatusDraft({ ...statusDraft, reason: event.target.value })}><option value="">Select reason</option><option value="Away at school">Away at school</option><option value="Medical leave">Medical</option><option value="Other leave">Other</option></select></label>}{statusDraft.status === "borrowed" && <label>Home store<select value={statusDraft.home_store_id} onChange={(event) => setStatusDraft({ ...statusDraft, home_store_id: event.target.value })}><option value="">Select home store</option>{stores.filter((store) => store.id !== storeId).map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>}{statusDraft.status === "terminated" && <><label>Termination report <small>Recommended</small><select value={statusDraft.hr_action_id} onChange={(event) => { const record = terminationRecords.find((item) => item.id === event.target.value); setStatusDraft({ ...statusDraft, hr_action_id: event.target.value, reason: record?.incident_summary || statusDraft.reason }); }}><option value="">No linked report — use notes below</option>{terminationRecords.map((record) => <option key={record.id} value={record.id}>{record.incident_date} · {record.employee_name}</option>)}</select></label><label>Termination reason<textarea rows={3} value={statusDraft.reason} onChange={(event) => setStatusDraft({ ...statusDraft, reason: event.target.value })} /></label></>}{statusDraft.status !== "terminated" && statusDraft.status !== "on_leave" && <label>Reason <small>Optional</small><input value={statusDraft.reason} onChange={(event) => setStatusDraft({ ...statusDraft, reason: event.target.value })} /></label>}<label>Notes <small>{statusDraft.status === "terminated" && !statusDraft.hr_action_id ? "Required without a linked report" : "Optional"}</small><textarea rows={3} value={statusDraft.notes} onChange={(event) => setStatusDraft({ ...statusDraft, notes: event.target.value })} /></label><div className="calendar-editor-actions"><button type="button" className="button secondary" onClick={() => setStatusMember(null)}>Cancel</button><button type="button" className="button primary" onClick={() => void saveEmploymentStatus()}><Save size={16}/>Save status</button></div></section></div>}
        </div>
      ) : view === "availability" ? (
        <div className="availability-layout">
          <section className="panel availability-editor"><div><p className="eyebrow">Availability entry</p><h2>{availabilityForm.kind === "standard" ? "Recurring standard availability" : "Requested time off"}</h2><p>{availabilityForm.kind === "standard" ? "This repeats every week until it is changed." : `This applies only to the week of ${formatWeek(weekStart)}.`}</p></div><label>Employee<select value={availabilityForm.member_id} onChange={(event) => chooseAvailability(event.target.value, availabilityForm.day_of_week, availabilityForm.kind)}><option value="">Select employee</option>{members.map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}</select></label><label>Entry type<select value={availabilityForm.kind} onChange={(event) => chooseAvailability(availabilityForm.member_id, availabilityForm.day_of_week, event.target.value as "standard" | "rto")}><option value="standard">Standard availability · repeats</option><option value="rto">Requested time off · this week</option></select></label><label>Day<select value={availabilityForm.day_of_week} onChange={(event) => chooseAvailability(availabilityForm.member_id, Number(event.target.value), availabilityForm.kind)}>{days.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>
            {availabilityForm.kind === "standard" ? <label>Status<select value={availabilityForm.standard_status} onChange={(event) => setAvailabilityForm({ ...availabilityForm, standard_status: event.target.value as typeof availabilityForm.standard_status })}><option value="available">Available all day</option><option value="limited">Available only during set times</option><option value="unavailable">Not available</option></select></label> : <label className="checkbox-line"><input type="checkbox" checked={availabilityForm.all_day} onChange={(event) => setAvailabilityForm({ ...availabilityForm, all_day: event.target.checked })} />Entire day requested off</label>}
            {((availabilityForm.kind === "standard" && availabilityForm.standard_status === "limited") || (availabilityForm.kind === "rto" && !availabilityForm.all_day)) && <div className="availability-time-row"><label>Starts<input type="time" step="900" value={availabilityForm.start_time} onChange={(event) => setAvailabilityForm({ ...availabilityForm, start_time: event.target.value })} /></label><label>Ends<input type="time" step="900" value={availabilityForm.end_time} onChange={(event) => setAvailabilityForm({ ...availabilityForm, end_time: event.target.value })} /></label></div>}
            {availabilityForm.kind === "rto" && <label>Reason or note <span className="optional-label">Optional</span><input value={availabilityForm.reason} onChange={(event) => setAvailabilityForm({ ...availabilityForm, reason: event.target.value })} placeholder="Appointment, vacation, school event…" /></label>}
            <div className="button-row"><button className="button primary" onClick={() => void saveAvailability()}><Save size={17} />Save {availabilityForm.kind === "standard" ? "availability" : "request"}</button>{selectedAvailabilityEntry && <button className="button secondary danger" onClick={() => void clearAvailability()}><Trash2 size={17} />Clear entry</button>}</div>
          </section>
          <section className="panel availability-week-panel"><div className="table-toolbar"><div><p className="eyebrow">Week at a glance</p><h2>Standard availability + requests</h2><p>Click any employee/day cell to edit it. Blue is recurring availability; orange/red is requested time off for this selected week.</p></div></div>{members.length === 0 ? <div className="activity-empty">Add employees to the roster before recording availability.</div> : <div className="responsive-table"><table className="availability-table"><thead><tr><th>Employee</th>{days.map((day, dayIndex) => <th key={day}>{day.slice(0, 3)}<small>{formatScheduleDate(weekStart, dayIndex, true)}</small></th>)}</tr></thead><tbody>{members.map((member) => <tr key={member.id}><td><strong>{member.display_name}</strong></td>{days.map((_, day) => { const standard = availability.find((item) => item.member_id === member.id && item.day_of_week === day && item.kind === "standard"); const rto = availability.find((item) => item.member_id === member.id && item.day_of_week === day && item.kind === "rto"); const standardAllDay = !standard || (standard.start_time.slice(0, 5) === "00:00" && standard.end_time.slice(0, 5) === "23:59" && standard.available); return <td key={day}><button className={`availability-cell-button ${rto ? "has-rto" : standard && !standard.available ? "unavailable" : standardAllDay ? "available" : "limited"}`} onClick={() => chooseAvailability(member.id, day, rto ? "rto" : "standard")}><span>{standard && !standard.available ? "⛔ Not available" : standardAllDay ? "✓ Available" : `⚠ ${displayTime(standard!.start_time)}–${displayTime(standard!.end_time)}`}</span>{rto && <strong>{rto.start_time.slice(0, 5) === "00:00" && rto.end_time.slice(0, 5) === "23:59" ? "RTO · all day" : `RTO · ${displayTime(rto.start_time)}–${displayTime(rto.end_time)}`}</strong>}</button></td>; })}</tr>)}</tbody></table></div>}</section>
        </div>
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
          <section className="panel labor-event-list"><div className="panel-heading"><div><p className="eyebrow">Shared calendar</p><h2>Current and upcoming events</h2><p>Company events appear for every store. Local events appear only for their store. Past events remain saved for forecasting and review.</p></div>{historicalEvents.length > 0 && <button type="button" className="button secondary" onClick={() => setShowHistoricalEvents((current) => !current)}><History size={17} />{showHistoricalEvents ? "Hide history" : `Show history (${historicalEvents.length})`}</button>}</div>
            {visibleEvents.length === 0 ? <div className="activity-empty">{events.length === 0 ? "No scheduling events have been added yet." : "No current or upcoming events. Use Show history to review past events."}</div> : <div className="event-card-list">{visibleEvents.map((event) => <article key={event.id} className={`event-card ${event.status}`}><div className="event-date"><strong>{new Date(`${event.start_date}T12:00:00`).toLocaleDateString(undefined, { month: "short" })}</strong><span>{new Date(`${event.start_date}T12:00:00`).getDate()}</span></div><div className="event-copy"><div className="event-tags"><span>{event.scope === "company" ? "Company-wide" : stores.find((store) => store.id === event.store_id)?.name || "Store"}</span><span>{event.category.replace("_", " ")}</span><span>{event.impact_mode === "learning" ? "Track & learn" : "Expected lift"}</span></div><h3>{event.name}</h3><p>{event.start_date === event.end_date ? formatWeek(event.start_date) : `${formatWeek(event.start_date)} – ${formatWeek(event.end_date)}`}{event.recurrence === "annual" ? " · repeats annually" : ""}</p>{event.notes && <small>{event.notes}</small>}<div className="event-lifts">{event.sales_lift_percent !== null && <span>Sales {event.sales_lift_percent > 0 ? "+" : ""}{event.sales_lift_percent}%</span>}{event.order_count_lift_percent !== null && <span>Orders {event.order_count_lift_percent > 0 ? "+" : ""}{event.order_count_lift_percent}%</span>}{event.oven_items_lift_percent !== null && <span>Oven {event.oven_items_lift_percent > 0 ? "+" : ""}{event.oven_items_lift_percent}%</span>}{event.delivery_lift_percent !== null && <span>Delivery {event.delivery_lift_percent > 0 ? "+" : ""}{event.delivery_lift_percent}%</span>}</div></div><div className="event-actions">{event.end_date < todayIso && <button className="button secondary compact" onClick={() => reuseEvent(event)}>Use again</button>}{canEditEvent(event) && <><button className="icon-button" aria-label={`Edit ${event.name}`} onClick={() => editEvent(event)}><Settings2 size={17} /></button><button className="icon-button danger" aria-label={`Delete ${event.name}`} onClick={() => void deleteEvent(event)}><Trash2 size={17} /></button></>}</div></article>)}</div>}
          </section>
        </div>
      ) : view === "settings" ? (
        <section className="panel labor-settings"><div className="panel-heading"><div><p className="eyebrow">Store-specific rules</p><h2>Staffing assumptions</h2></div><button className="button primary" onClick={saveSettings}><Save size={17} />Save settings</button></div><div className="labor-settings-grid">
          <label>Insider oven items / 15 min<input type="number" step="0.5" value={settings.insider_items_per_15} onChange={(event) => setSettings({ ...settings, insider_items_per_15: Number(event.target.value) })} /></label><label>Manager oven items / 15 min<input type="number" step="0.5" value={settings.manager_items_per_15} onChange={(event) => setSettings({ ...settings, manager_items_per_15: Number(event.target.value) })} /></label><label>Fri/Sat insider items / 15 min<input type="number" step="0.5" value={settings.weekend_insider_items_per_15} onChange={(event) => setSettings({ ...settings, weekend_insider_items_per_15: Number(event.target.value) })} /></label><label>Fri/Sat manager items / 15 min<input type="number" step="0.5" value={settings.weekend_manager_items_per_15} onChange={(event) => setSettings({ ...settings, weekend_manager_items_per_15: Number(event.target.value) })} /></label><label>Average delivery run time (minutes)<input type="number" min="1" max="120" step="1" value={settings.average_run_time_minutes} onChange={(event) => setSettings({ ...settings, average_run_time_minutes: Math.max(1, Number(event.target.value)) })} /><small>Drivers stay unavailable across later 15-minute periods until this return time has elapsed.</small></label><label>Manager crossover<select value={settings.manager_crossover_minutes} onChange={(event) => setSettings({ ...settings, manager_crossover_minutes: Number(event.target.value) })}>{[15,30,45,60,75,90,105,120].map((value) => <option key={value} value={value}>{value} minutes</option>)}</select></label><label>Opening manager prep time<select value={settings.manager_preopen_minutes} onChange={(event) => setSettings({ ...settings, manager_preopen_minutes: Number(event.target.value) })}>{[0,15,30,45,60,75,90,105,120].map((value) => <option key={value} value={value}>{value} minutes</option>)}</select></label><label>Opening driver prep time<select value={settings.driver_preopen_minutes} onChange={(event) => setSettings({ ...settings, driver_preopen_minutes: Number(event.target.value) })}>{[0,15,30,45,60,75,90,105,120].map((value) => <option key={value} value={value}>{value} minutes</option>)}</select></label><label>Closing manager clean time<select value={settings.manager_postclose_minutes} onChange={(event) => setSettings({ ...settings, manager_postclose_minutes: Number(event.target.value) })}>{[0,15,30,45,60,75,90,105,120].map((value) => <option key={value} value={value}>{value} minutes</option>)}</select></label><label>Closing driver clean time<select value={settings.driver_postclose_minutes} onChange={(event) => setSettings({ ...settings, driver_postclose_minutes: Number(event.target.value) })}>{[0,15,30,45,60,75,90,105,120].map((value) => <option key={value} value={value}>{value} minutes</option>)}</select></label><label>Minimum shift hours<input type="number" step="0.25" value={settings.minimum_shift_hours} onChange={(event) => setSettings({ ...settings, minimum_shift_hours: Number(event.target.value) })} /></label><label>Maximum shift hours<input type="number" step="0.25" value={settings.max_shift_hours} onChange={(event) => setSettings({ ...settings, max_shift_hours: Number(event.target.value) })} /></label><label>Minor maximum before break<input type="number" step="0.25" min="1" max="5.75" value={minorShiftLimit} onChange={(event) => setSettings({ ...settings, minor_break_after_hours: Math.min(5.75, Number(event.target.value)) })} /><small>Longer minor shifts remain selectable and are flagged for a required 30-minute break.</small></label><label>Late-driver rule<select value={settings.late_driver_rule} onChange={(event) => setSettings({ ...settings, late_driver_rule: event.target.value as Settings["late_driver_rule"] })}><option value="hour_before_close">One hour before close</option><option value="until_close">Until close</option><option value="second_closer">Second closing driver</option></select></label><label className="checkbox-line"><input type="checkbox" checked={settings.opening_driver_through_rush} onChange={(event) => setSettings({ ...settings, opening_driver_through_rush: event.target.checked })} />Allow opening driver through rush when it saves labor</label>
        </div><div className="labor-hours-section"><div><h3>Hours of operation</h3><p>Closing times after midnight belong to the business day shown. These hours drive opening and closing coverage.</p></div><div className="labor-hours-grid">{storeHours.map((item) => <div className="labor-hours-row" key={item.day_of_week}><strong>{days[item.day_of_week]}</strong><label>Open<input type="time" value={item.open_time} onChange={(event) => setStoreHours((current) => current.map((hour) => hour.day_of_week === item.day_of_week ? { ...hour, open_time: event.target.value } : hour))} /></label><label>Close<input type="time" value={item.close_time} onChange={(event) => setStoreHours((current) => current.map((hour) => hour.day_of_week === item.day_of_week ? { ...hour, close_time: event.target.value } : hour))} /></label></div>)}</div></div></section>
      ) : (
        <div className="labor-data-grid"><section className="panel"><Upload size={27} /><p className="eyebrow">Weekly data intake</p><h2>Wizardline imports</h2><p>Upload the three Weekly Summary reports for each store: Royalty Sales, All Oven Items, and Delivery Orders. Imports are stored by store, week, date, and 15-minute interval.</p><button className="button primary" disabled><Upload size={17} />Import center coming next</button></section><section className="panel"><History size={27} /><p className="eyebrow">Permanent record</p><h2>Published schedule history</h2><p>Each publication creates an immutable snapshot. Managers can reopen an old week without overwriting the current schedule.</p><strong>{planStatus === "published" ? "This week is published" : "This week is still a draft"}</strong></section></div>
      )}
    </div>
  );
}
