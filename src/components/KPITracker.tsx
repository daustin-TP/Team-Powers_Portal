import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Building2,
  CheckCircle2,
  LayoutList,
  RefreshCw,
  Save,
  Store,
  TableProperties,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import type { Profile } from "../types";

type KpiMetric = {
  trajectory: string;
  suggested_goal: string;
  supervisor_goal: number | null;
  actual: string;
  final_goal: string;
  status: string;
};

type Commitment = {
  store_id?: string;
  source?: "database" | "sheet_bridge";
  row_number: number;
  week_end: string;
  store: string;
  sales: {
    model_projection: string;
    recommended_goal: string;
    supervisor_goal: number | null;
    actual: string;
    final_goal: string;
    variance: string;
    variance_percent: string;
    status: string;
  };
  accountability: { focus_area: string; action_plan: string; owner: string };
  labor: KpiMetric;
  splh: KpiMetric;
  food_variance: KpiMetric;
  load: KpiMetric;
  adt: KpiMetric;
  extreme_orders: { actual: string; goal?: string; variance?: string; status: string };
  overall_status: string;
};

type SupervisorGroup = { id: string; name: string; stores: string[] };
type KpiAccess = {
  canEdit: boolean;
  canViewAll: boolean;
  editableStores: string[] | null;
  assignedStores: string[];
  supervisorGroups: SupervisorGroup[];
};
type ViewLevel = "company" | "supervisor" | "store";
type DashboardMode = "commitments" | "details";
type WeeklyMetricRow = {
  store_id?: string;
  store: string;
  week_end: string;
  metrics: Record<string, unknown>;
};
type SharedForecast = {
  store_id: string;
  store: string;
  confidence_score: number;
  confidence_level: "low" | "moderate" | "high";
  weekly_projection: { projected_sales?: number; low_sales?: number; high_sales?: number; projected_orders?: number };
};
type MetricFormat = "currency0" | "currency2" | "percent" | "number0" | "number1" | "number2";
type MetricDefinition = {
  key: string;
  label: string;
  group: string;
  aggregate: "sum" | "average";
  format: MetricFormat;
};
type Draft = {
  supervisor_sales_goal: string;
  focus_area: string;
  action_plan: string;
  owner: string;
  supervisor_labor_goal: string;
  supervisor_splh_goal: string;
  supervisor_food_variance_goal: string;
  supervisor_load_goal: string;
  supervisor_adt_goal: string;
};

const focusAreas = ["Sales", "Labor", "Food", "Service", "Staffing", "Marketing", "Operations"];

const weeklyMetricDefinitions: MetricDefinition[] = [
  { key: "royalty_sales", label: "Royalty sales", group: "Sales & customers", aggregate: "sum", format: "currency2" },
  { key: "sales_last_year", label: "Sales last year", group: "Sales & customers", aggregate: "sum", format: "currency2" },
  { key: "yoy_sales_percent", label: "YoY sales", group: "Sales & customers", aggregate: "average", format: "percent" },
  { key: "order_count", label: "Order count", group: "Sales & customers", aggregate: "sum", format: "number0" },
  { key: "orders_last_year", label: "Orders last year", group: "Sales & customers", aggregate: "sum", format: "number0" },
  { key: "order_growth_percent", label: "Order growth", group: "Sales & customers", aggregate: "average", format: "percent" },
  { key: "new_customers", label: "New customers", group: "Sales & customers", aggregate: "sum", format: "number0" },
  { key: "average_ticket", label: "Average ticket", group: "Sales & customers", aggregate: "average", format: "currency2" },
  { key: "st_jude_net", label: "St. Jude net", group: "Sales & customers", aggregate: "sum", format: "currency2" },
  { key: "labor_dollars", label: "Labor dollars", group: "Labor", aggregate: "sum", format: "currency2" },
  { key: "labor_percent", label: "Labor percent", group: "Labor", aggregate: "average", format: "percent" },
  { key: "splh", label: "SPLH", group: "Labor", aggregate: "average", format: "currency2" },
  { key: "ot_hours", label: "OT hours", group: "Labor", aggregate: "sum", format: "number1" },
  { key: "actual_food_percent", label: "Actual food", group: "Food & controls", aggregate: "average", format: "percent" },
  { key: "ideal_food_percent", label: "Ideal food", group: "Food & controls", aggregate: "average", format: "percent" },
  { key: "food_difference_dollars", label: "Food difference", group: "Food & controls", aggregate: "sum", format: "currency2" },
  { key: "food_difference_percent", label: "Food variance", group: "Food & controls", aggregate: "average", format: "percent" },
  { key: "cash_over_short", label: "Cash +/-", group: "Food & controls", aggregate: "sum", format: "currency2" },
  { key: "cheese_variance", label: "Cheese variance", group: "Food & controls", aggregate: "sum", format: "number1" },
  { key: "pepperoni_variance", label: "Pepperoni variance", group: "Food & controls", aggregate: "sum", format: "number1" },
  { key: "dough_variance", label: "Dough variance", group: "Food & controls", aggregate: "sum", format: "number1" },
  { key: "avg_adt", label: "Average ADT", group: "Service", aggregate: "average", format: "number2" },
  { key: "adt_under_30_percent", label: "ADT under 30", group: "Service", aggregate: "average", format: "percent" },
  { key: "extreme_order_count", label: "Extreme orders", group: "Service", aggregate: "sum", format: "number0" },
  { key: "extreme_order_percent", label: "Extreme order percent", group: "Service", aggregate: "average", format: "percent" },
  { key: "avg_wait", label: "Average wait", group: "Service", aggregate: "average", format: "number2" },
  { key: "singles_percent", label: "Singles", group: "Service", aggregate: "average", format: "percent" },
  { key: "avg_load", label: "Average load", group: "Service", aggregate: "average", format: "number2" },
];

const weeklyMetricGroups = Array.from(new Set(weeklyMetricDefinitions.map((metric) => metric.group)));

const storeNames: Record<string, string> = {
  "1412": "Jamestown",
  "1443": "Baxter",
  "1493": "Fairfield Glade",
  "5408": "Manchester",
  "5430": "North Cookeville",
  "5449": "Algood",
  "5452": "South Cookeville",
  "5491": "Smithville",
  "6176": "Livingston",
  "6303": "Sparta",
  "6326": "Dunlap",
  "8702": "Monterey",
};

function storeLabel(store: string) {
  const storeNumber = store.replace(/^Store\s+/i, "").split(" · ")[0];
  return storeNames[storeNumber] ? `${storeNames[storeNumber]} ${storeNumber}` : `Store ${storeNumber}`;
}

function mostRecentCompletedSunday() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - (date.getDay() === 0 ? 7 : date.getDay()));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addIsoDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function demoMetric(trajectory: string, suggested: string, supervisor: number): KpiMetric {
  return { trajectory, suggested_goal: suggested, supervisor_goal: supervisor, actual: "Pending", final_goal: suggested, status: "Pending" };
}

const demoCommitments: Commitment[] = [
  {
    row_number: 4,
    week_end: mostRecentCompletedSunday(),
    store: "1412",
    sales: { model_projection: "$37,381", recommended_goal: "$38,100", supervisor_goal: 39000, actual: "$39,420", final_goal: "$39,000", variance: "$420", variance_percent: "1.1%", status: "Yes" },
    accountability: { focus_area: "Sales", action_plan: "Build Friday dinner staffing and confirm school-event outreach.", owner: "Store leadership" },
    labor: { ...demoMetric("23.8%", "23.4%", 0.232), actual: "23.1%", status: "Yes" },
    splh: { ...demoMetric("$55.24", "$56.43", 57), actual: "$57.18", status: "Yes" },
    food_variance: { ...demoMetric("1.7%", "1.5%", 0.015), actual: "1.6%", status: "No" },
    load: { ...demoMetric("3.7", "3.7", 3.5), actual: "3.4", status: "Yes" },
    adt: { ...demoMetric("21.2", "21.1", 21), actual: "20.8", status: "Yes" },
    extreme_orders: { actual: "3.3%", goal: "1.0%", variance: "2.3%", status: "No" },
    overall_status: "Needs Follow-Up",
  },
  {
    row_number: 5,
    week_end: mostRecentCompletedSunday(),
    store: "1633",
    sales: { model_projection: "$31,200", recommended_goal: "$31,700", supervisor_goal: 32000, actual: "$31,810", final_goal: "$32,000", variance: "-$190", variance_percent: "-0.6%", status: "No" },
    accountability: { focus_area: "Service", action_plan: "Coach peak-hour load and oven flow.", owner: "GM" },
    labor: { ...demoMetric("24.5%", "24.0%", 0.24), actual: "24.2%", status: "No" },
    splh: { ...demoMetric("$51.30", "$52.10", 53), actual: "$52.42", status: "No" },
    food_variance: { ...demoMetric("1.9%", "1.6%", 0.016), actual: "1.5%", status: "Yes" },
    load: { ...demoMetric("4.1", "3.9", 3.8), actual: "3.8", status: "Yes" },
    adt: { ...demoMetric("22.5", "22.0", 21.8), actual: "21.7", status: "Yes" },
    extreme_orders: { actual: "1.4%", goal: "1.0%", variance: "0.4%", status: "No" },
    overall_status: "Needs Follow-Up",
  },
];

const demoWeeklyMetrics: WeeklyMetricRow[] = demoCommitments.map((item, index) => ({
  store: item.store,
  week_end: mostRecentCompletedSunday(),
  metrics: {
    avg_adt: index ? "21.7" : "20.8",
    adt_under_30_percent: index ? "86.4%" : "89.2%",
    extreme_order_count: index ? "6" : "4",
    extreme_order_percent: index ? "1.4%" : "3.3%",
    avg_wait: index ? "2.4" : "2.1",
    singles_percent: index ? "31.2%" : "29.8%",
    new_customers: index ? "118" : "143",
    cheese_variance: index ? "-3.2" : "1.4",
    pepperoni_variance: index ? "2.1" : "-1.2",
    dough_variance: index ? "-4.0" : "2.5",
    average_ticket: index ? "$24.81" : "$25.42",
    st_jude_net: index ? "$189.20" : "$241.15",
    royalty_sales: index ? "$31,810" : "$39,420",
    sales_last_year: index ? "$30,980" : "$37,100",
    yoy_sales_percent: index ? "2.7%" : "6.3%",
    order_count: index ? "1282" : "1551",
    orders_last_year: index ? "1269" : "1484",
    order_growth_percent: index ? "1.0%" : "4.5%",
    labor_dollars: index ? "$7,698" : "$9,106",
    labor_percent: index ? "24.2%" : "23.1%",
    splh: index ? "$52.42" : "$57.18",
    ot_hours: index ? "7.5" : "3.2",
    actual_food_percent: index ? "29.6%" : "29.1%",
    ideal_food_percent: index ? "28.1%" : "27.5%",
    food_difference_dollars: index ? "$477.15" : "$630.72",
    food_difference_percent: index ? "1.5%" : "1.6%",
    cash_over_short: index ? "-$12.40" : "$4.18",
    avg_load: index ? "3.8" : "3.4",
  },
}));

function emptyDraft(): Draft {
  return { supervisor_sales_goal: "", focus_area: "", action_plan: "", owner: "", supervisor_labor_goal: "", supervisor_splh_goal: "", supervisor_food_variance_goal: "", supervisor_load_goal: "", supervisor_adt_goal: "" };
}

function draftFromCommitment(item: Commitment): Draft {
  const value = (input: number | null) => input === null ? "" : String(input);
  const percent = (input: number | null) => input === null ? "" : String(Number((input * 100).toFixed(3)));
  return {
    supervisor_sales_goal: value(item.sales.supervisor_goal),
    focus_area: item.accountability.focus_area,
    action_plan: item.accountability.action_plan,
    owner: item.accountability.owner,
    supervisor_labor_goal: percent(item.labor.supervisor_goal),
    supervisor_splh_goal: value(item.splh.supervisor_goal),
    supervisor_food_variance_goal: percent(item.food_variance.supervisor_goal),
    supervisor_load_goal: value(item.load.supervisor_goal),
    supervisor_adt_goal: value(item.adt.supervisor_goal),
  };
}

function score(item: Commitment) {
  const statuses = [item.sales.status, item.labor.status, item.splh.status, item.food_variance.status, item.load.status, item.adt.status];
  const resolved = statuses.filter((status) => !["", "pending", "—"].includes(status.toLowerCase()));
  const hits = resolved.filter((status) => ["yes", "met", "goals met", "on track"].includes(status.toLowerCase())).length;
  return { hits, total: resolved.length, percent: resolved.length ? Math.round((hits / resolved.length) * 100) : null };
}

function ordered(items: Commitment[]) {
  return [...items].sort((a, b) => (score(b).percent ?? -1) - (score(a).percent ?? -1));
}

function numericValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text || /pending|—/i.test(text)) return null;
  const parsed = Number(text.replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrency(value: number | null, decimals = 0) {
  return value === null ? "Pending" : new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

function formatPercent(value: number | null) {
  if (value === null) return "Pending";
  const percentValue = Math.abs(value) <= 1 ? value * 100 : value;
  return `${percentValue.toFixed(1)}%`;
}

function formatMetricValue(value: number | null, format: MetricFormat) {
  if (format === "currency0") return formatCurrency(value);
  if (format === "currency2") return formatCurrency(value, 2);
  if (format === "percent") return formatPercent(value);
  if (value === null) return "Pending";
  const decimals = format === "number2" ? 2 : format === "number1" ? 1 : 0;
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

function aggregateMetric(rows: WeeklyMetricRow[], definition: MetricDefinition) {
  const values = rows
    .map((row) => numericValue(row.metrics[definition.key]))
    .filter((value): value is number => value !== null);
  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return definition.aggregate === "sum" ? total : total / values.length;
}

function displayMetricValue(metrics: Record<string, unknown>, definition: MetricDefinition) {
  return formatMetricValue(numericValue(metrics[definition.key]), definition.format);
}

function commitmentMetricFormat(metricName: string): MetricFormat {
  if (metricName === "Sales" || metricName === "SPLH") return "currency2";
  if (metricName === "Labor" || metricName === "Food variance") return "percent";
  return "number2";
}

function displayCommitmentValue(metricName: string, value: string, fallback: string) {
  if (!value) return fallback;
  const parsed = numericValue(value);
  return parsed === null ? value : formatMetricValue(parsed, commitmentMetricFormat(metricName));
}

function metricText(metrics: Record<string, unknown>, key: string, fallback = "") {
  const value = metrics[key];
  return value === null || value === undefined ? fallback : String(value);
}

function goalValue(goals: Record<string, unknown>, key: string) {
  const value = goals[key];
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function goalStatus(actualText: string, goal: number | null, lowerIsBetter = false) {
  const actual = numericValue(actualText);
  if (actual === null || goal === null) return "Pending";
  return lowerIsBetter ? (actual <= goal ? "Yes" : "No") : (actual >= goal ? "Yes" : "No");
}

function databaseCommitment(
  result: { store_id: string; week_end: string; metrics: Record<string, unknown>; stores?: { name?: string } | Array<{ name?: string }> | null },
  goalRow?: { goals?: Record<string, unknown>; focus_area?: string; action_plan?: string; owner?: string },
): Commitment {
  const metrics = result.metrics ?? {};
  const goals = goalRow?.goals ?? {};
  const storeName = Array.isArray(result.stores) ? result.stores[0]?.name : result.stores?.name;
  const store = metricText(metrics, "store_number", storeName ?? "Store").replace(/^Store\s+/i, "").split(" · ")[0];
  const salesGoal = goalValue(goals, "sales");
  const laborGoal = goalValue(goals, "labor");
  const splhGoal = goalValue(goals, "splh");
  const foodGoal = goalValue(goals, "food_variance");
  const loadGoal = goalValue(goals, "load");
  const adtGoal = goalValue(goals, "adt");
  const salesActual = metricText(metrics, "royalty_sales", "Pending");
  const laborActual = metricText(metrics, "labor_percent", "Pending");
  const splhActual = metricText(metrics, "splh", "Pending");
  const foodActual = metricText(metrics, "food_difference_percent", "Pending");
  const loadActual = metricText(metrics, "avg_load", "Pending");
  const adtActual = metricText(metrics, "avg_adt", "Pending");
  const metric = (trajectory: string, suggested: string, supervisor: number | null, actual: string, lowerIsBetter = false): KpiMetric => ({
    trajectory, suggested_goal: suggested, supervisor_goal: supervisor,
    actual, final_goal: supervisor === null ? suggested : String(supervisor),
    status: goalStatus(actual, supervisor ?? numericValue(suggested), lowerIsBetter),
  });
  const commitment: Commitment = {
    store_id: result.store_id, source: "database", row_number: 0, week_end: result.week_end, store,
    sales: {
      model_projection: metricText(metrics, "sales_projection"),
      recommended_goal: metricText(metrics, "sales_recommended_goal"),
      supervisor_goal: salesGoal,
      actual: salesActual,
      final_goal: salesGoal === null ? metricText(metrics, "sales_recommended_goal") : String(salesGoal),
      variance: "", variance_percent: "", status: goalStatus(salesActual, salesGoal ?? numericValue(metricText(metrics, "sales_recommended_goal"))),
    },
    accountability: { focus_area: goalRow?.focus_area ?? "", action_plan: goalRow?.action_plan ?? "", owner: goalRow?.owner ?? "" },
    labor: metric(metricText(metrics, "labor_trajectory"), metricText(metrics, "labor_recommended_goal"), laborGoal, laborActual, true),
    splh: metric(metricText(metrics, "splh_trajectory"), metricText(metrics, "splh_recommended_goal"), splhGoal, splhActual),
    food_variance: metric(metricText(metrics, "food_variance_trajectory"), metricText(metrics, "food_variance_recommended_goal"), foodGoal, foodActual, true),
    load: metric(metricText(metrics, "load_trajectory"), metricText(metrics, "load_recommended_goal"), loadGoal, loadActual, true),
    adt: metric(metricText(metrics, "adt_trajectory"), metricText(metrics, "adt_recommended_goal"), adtGoal, adtActual, true),
    extreme_orders: { actual: metricText(metrics, "extreme_order_percent", "Pending"), goal: metricText(metrics, "extreme_order_goal", "1.0%"), status: "Pending" },
    overall_status: "Pending",
  };
  const statuses = [commitment.sales.status, commitment.labor.status, commitment.splh.status, commitment.food_variance.status, commitment.load.status, commitment.adt.status];
  commitment.overall_status = statuses.some((status) => status === "No") ? "Needs Follow-Up" : statuses.some((status) => status === "Yes") ? "Goals Met" : "Pending";
  return commitment;
}

export default function KPITracker({ profile }: { profile: Profile }) {
  const [weekEnd, setWeekEnd] = useState(mostRecentCompletedSunday());
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [weeklyMetrics, setWeeklyMetrics] = useState<WeeklyMetricRow[]>([]);
  const [sharedForecasts, setSharedForecasts] = useState<SharedForecast[]>([]);
  const [weeklyMetricsError, setWeeklyMetricsError] = useState("");
  const [selectedStore, setSelectedStore] = useState("");
  const [selectedSupervisor, setSelectedSupervisor] = useState("");
  const [viewLevel, setViewLevel] = useState<ViewLevel>("store");
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>("commitments");
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [commitmentsLoading, setCommitmentsLoading] = useState(true);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [access, setAccess] = useState<KpiAccess>({
    canEdit: profile.role === "supervisor" || profile.role === "admin",
    canViewAll: profile.role === "supervisor" || profile.role === "admin",
    editableStores: profile.role === "admin" ? null : [],
    assignedStores: profile.location ? [profile.location] : [],
    supervisorGroups: [],
  });

  const selected = useMemo(() => commitments.find((item) => item.store === selectedStore) ?? commitments[0], [commitments, selectedStore]);
  const selectedGroup = access.supervisorGroups.find((group) => group.id === selectedSupervisor) ?? access.supervisorGroups[0];
  const scopedCommitments = useMemo(() => {
    if (viewLevel === "supervisor" && selectedGroup) return commitments.filter((item) => selectedGroup.stores.includes(item.store));
    if (viewLevel === "store" && selected) return [selected];
    return commitments;
  }, [commitments, selected, selectedGroup, viewLevel]);
  const scopedWeeklyMetrics = useMemo(() => {
    if (viewLevel === "supervisor" && selectedGroup) return weeklyMetrics.filter((item) => selectedGroup.stores.includes(item.store));
    if (viewLevel === "store" && selectedStore) return weeklyMetrics.filter((item) => item.store === selectedStore);
    return weeklyMetrics;
  }, [weeklyMetrics, selectedStore, selectedGroup, viewLevel]);
  const canEditSelected = Boolean(selected && access.canEdit && (access.editableStores === null || access.editableStores.includes(selected.store)));

  const accessFromResponse = (data: Record<string, any>): KpiAccess => ({
    canEdit: Boolean(data.access?.can_edit),
    canViewAll: Boolean(data.access?.can_view_all),
    editableStores: data.access?.editable_stores === null ? null : (data.access?.editable_stores ?? []),
    assignedStores: data.access?.assigned_stores ?? [],
    supervisorGroups: data.access?.supervisor_groups ?? [],
  });

  const applyAccess = (nextAccess: KpiAccess) => {
    setAccess(nextAccess);
    setViewLevel((current) => nextAccess.canViewAll ? current : "store");
    setSelectedSupervisor((current) => nextAccess.supervisorGroups.some((group) => group.id === current) ? current : nextAccess.supervisorGroups[0]?.id ?? "");
  };

  const loadCommitments = async () => {
    setCommitmentsLoading(true);
    setCommitments([]);
    setError("");
    setMessage("");
    if (!isSupabaseConfigured || !supabase) {
      const demo = demoCommitments.map((item) => ({ ...item, week_end: weekEnd }));
      setCommitments(demo);
      setSelectedStore(demo[0]?.store ?? "");
      setAccess((current) => ({ ...current, supervisorGroups: [{ id: "demo-supervisor", name: "North Area", stores: demo.map((item) => item.store) }] }));
      setViewLevel("company");
      setCommitmentsLoading(false);
      return;
    }

    const [resultRows, goalRows] = await Promise.all([
      supabase.from("kpi_weekly_results").select("store_id,week_end,metrics,stores(name)").eq("week_end", weekEnd),
      supabase.from("kpi_goal_commitments").select("store_id,goals,focus_area,action_plan,owner").eq("week_end", weekEnd),
    ]);
    if (!resultRows.error) {
      const goalsByStore = new Map((goalRows.data ?? []).map((item) => [item.store_id, item]));
      const rows = (resultRows.data ?? []).map((item) => databaseCommitment(item as Parameters<typeof databaseCommitment>[0], goalsByStore.get(item.store_id)));
      setCommitments(rows); setSelectedStore((current) => rows.length === 0 ? current : rows.some((item) => item.store === current) ? current : rows[0]?.store ?? ""); setCommitmentsLoading(false); return;
    }
    const { data, error: invokeError } = await supabase.functions.invoke("kpi-bridge", { body: { action: "get_commitments", week_end: weekEnd } });
    if (invokeError || !data?.ok) {
      setError(data?.error || invokeError?.message || "The KPI data could not be loaded.");
      setCommitments([]);
      setCommitmentsLoading(false);
      return;
    }

    const rows = (data.result ?? []).map((item: Commitment) => ({ ...item, source: "sheet_bridge" as const })) as Commitment[];
    const nextAccess = accessFromResponse(data);
    setCommitments(rows);
    applyAccess(nextAccess);
    setSelectedStore((current) => rows.some((item) => item.store === current) ? current : rows[0]?.store ?? "");
    setCommitmentsLoading(false);
  };

  const loadWeeklyMetrics = async () => {
    setMetricsLoading(true);
    setWeeklyMetrics([]);
    setWeeklyMetricsError("");
    setError("");
    if (!isSupabaseConfigured || !supabase) {
      const demo = demoWeeklyMetrics.map((item) => ({ ...item, week_end: weekEnd }));
      setWeeklyMetrics(demo);
      setSelectedStore((current) => demo.some((item) => item.store === current) ? current : demo[0]?.store ?? "");
      setMetricsLoading(false);
      return;
    }

    const directRows = await supabase.from("kpi_weekly_results").select("store_id,week_end,metrics,stores(name)").eq("week_end", weekEnd);
    if (!directRows.error) {
      const rows = (directRows.data ?? []).map((item) => {
        const storeRecord = Array.isArray(item.stores) ? item.stores[0] : item.stores;
        const metrics = item.metrics as Record<string, unknown>;
        return { store_id: item.store_id, store: metricText(metrics, "store_number", storeRecord?.name ?? "Store").replace(/^Store\s+/i, "").split(" · ")[0], week_end: item.week_end, metrics } as WeeklyMetricRow;
      });
      setWeeklyMetrics(rows); setSelectedStore((current) => rows.length === 0 ? current : rows.some((item) => item.store === current) ? current : rows[0]?.store ?? ""); setMetricsLoading(false); return;
    }
    const { data, error: invokeError } = await supabase.functions.invoke("kpi-bridge", { body: { action: "get_weekly_metrics", week_end: weekEnd } });
    if (invokeError || !data?.ok) {
      setWeeklyMetrics([]);
      setWeeklyMetricsError(data?.error || invokeError?.message || "The weekly KPI results could not be loaded.");
      setMetricsLoading(false);
      return;
    }

    const rows = (data.result ?? []) as WeeklyMetricRow[];
    setWeeklyMetrics(rows);
    applyAccess(accessFromResponse(data));
    setSelectedStore((current) => rows.some((item) => item.store === current) ? current : rows[0]?.store ?? "");
    setMetricsLoading(false);
  };

  const loadSharedForecasts = async () => {
    if (!isSupabaseConfigured || !supabase) { setSharedForecasts([]); return; }
    const { data, error: forecastError } = await supabase.from("demand_forecast_runs").select("store_id,confidence_score,confidence_level,weekly_projection,stores(name,store_number)").eq("week_start", addIsoDays(weekEnd, -6)).eq("is_current", true);
    if (forecastError) { setSharedForecasts([]); return; }
    setSharedForecasts((data ?? []).map((row) => {
      const storeRecord = Array.isArray(row.stores) ? row.stores[0] : row.stores;
      const storeNumber = String(storeRecord?.store_number ?? String(storeRecord?.name ?? "").match(/\b\d{4}\b/)?.[0] ?? "");
      return { store_id: row.store_id, store: storeNumber, confidence_score: Number(row.confidence_score), confidence_level: row.confidence_level, weekly_projection: row.weekly_projection ?? {} } as SharedForecast;
    }).filter((row) => row.store));
  };

  useEffect(() => {
    if (dashboardMode === "details") void loadWeeklyMetrics();
    else void loadCommitments();
  }, [weekEnd, dashboardMode]);
  useEffect(() => { void loadSharedForecasts(); }, [weekEnd]);
  useEffect(() => { setDraft(selected ? draftFromCommitment(selected) : emptyDraft()); }, [selected]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !canEditSelected) return;
    setSaving(true);
    setError("");
    setMessage("");
    if (!isSupabaseConfigured || !supabase) {
      setMessage("Demo commitment saved locally.");
      setSaving(false);
      return;
    }
    const numeric = (value: string) => value.trim() === "" ? null : Number(value);
    const percentage = (value: string) => value.trim() === "" ? null : Number(value) / 100;
    if (selected.source === "database" && selected.store_id) {
      const { error: databaseError } = await supabase.from("kpi_goal_commitments").upsert({
        store_id: selected.store_id, week_end: weekEnd,
        goals: { sales: numeric(draft.supervisor_sales_goal), labor: percentage(draft.supervisor_labor_goal), splh: numeric(draft.supervisor_splh_goal), food_variance: percentage(draft.supervisor_food_variance_goal), load: numeric(draft.supervisor_load_goal), adt: numeric(draft.supervisor_adt_goal) },
        focus_area: draft.focus_area, action_plan: draft.action_plan, owner: draft.owner, updated_by: profile.id, updated_at: new Date().toISOString(),
      }, { onConflict: "store_id,week_end" });
      if (databaseError) { setError(databaseError.message); setSaving(false); return; }
      setMessage(`Store ${selected.store} commitment saved in Dash-OS.`); setSaving(false); await loadCommitments(); return;
    }
    const { data, error: invokeError } = await supabase.functions.invoke("kpi-bridge", {
      body: {
        action: "update_commitment",
        week_end: weekEnd,
        store: selected.store,
        changes: {
          supervisor_sales_goal: numeric(draft.supervisor_sales_goal),
          focus_area: draft.focus_area,
          action_plan: draft.action_plan,
          owner: draft.owner,
          supervisor_labor_goal: percentage(draft.supervisor_labor_goal),
          supervisor_splh_goal: numeric(draft.supervisor_splh_goal),
          supervisor_food_variance_goal: percentage(draft.supervisor_food_variance_goal),
          supervisor_load_goal: numeric(draft.supervisor_load_goal),
          supervisor_adt_goal: numeric(draft.supervisor_adt_goal),
        },
      },
    });
    if (invokeError || !data?.ok) {
      setError(data?.error || invokeError?.message || "The commitment could not be saved.");
      setSaving(false);
      return;
    }
    const updated = data.result as Commitment;
    setCommitments((current) => current.map((item) => item.store === updated.store ? updated : item));
    setMessage(`Store ${updated.store} was updated in Google Sheets.`);
    setSaving(false);
  };

  const metrics = selected ? [
    ["Sales", selected.sales.model_projection, selected.sales.recommended_goal, selected.sales.final_goal, selected.sales.actual, selected.sales.status],
    ["Labor", selected.labor.trajectory, selected.labor.suggested_goal, selected.labor.final_goal, selected.labor.actual, selected.labor.status],
    ["SPLH", selected.splh.trajectory, selected.splh.suggested_goal, selected.splh.final_goal, selected.splh.actual, selected.splh.status],
    ["Food variance", selected.food_variance.trajectory, selected.food_variance.suggested_goal, selected.food_variance.final_goal, selected.food_variance.actual, selected.food_variance.status],
    ["Load", selected.load.trajectory, selected.load.suggested_goal, selected.load.final_goal, selected.load.actual, selected.load.status],
    ["ADT", selected.adt.trajectory, selected.adt.suggested_goal, selected.adt.final_goal, selected.adt.actual, selected.adt.status],
  ] : [];
  const rankings = ordered(scopedCommitments);
  const scopedForecasts = sharedForecasts.filter((forecast) => viewLevel === "company" || (viewLevel === "supervisor" && selectedGroup?.stores.includes(forecast.store)) || (viewLevel === "store" && forecast.store === selectedStore));
  const forecastsByStore = new Map(sharedForecasts.map((forecast) => [forecast.store, forecast]));
  const projectedSalesTotal = scopedForecasts.reduce((sum, forecast) => sum + Number(forecast.weekly_projection.projected_sales || 0), 0);
  const projectedLowTotal = scopedForecasts.reduce((sum, forecast) => sum + Number(forecast.weekly_projection.low_sales || 0), 0);
  const projectedHighTotal = scopedForecasts.reduce((sum, forecast) => sum + Number(forecast.weekly_projection.high_sales || 0), 0);
  const averageForecastConfidence = scopedForecasts.length ? scopedForecasts.reduce((sum, forecast) => sum + forecast.confidence_score, 0) / scopedForecasts.length : 0;
  const goalsMet = scopedCommitments.reduce((total, item) => total + score(item).hits, 0);
  const measuredGoals = scopedCommitments.reduce((total, item) => total + score(item).total, 0);
  const detailTotals = weeklyMetricDefinitions.map((definition) => ({
    ...definition,
    value: formatMetricValue(aggregateMetric(scopedWeeklyMetrics, definition), definition.format),
    detail: definition.aggregate === "sum" ? "Total across selected stores" : "Store average",
  }));
  const currentLoading = dashboardMode === "details" ? metricsLoading : commitmentsLoading;
  const storeTabs = dashboardMode === "details"
    ? weeklyMetrics.map((item) => ({ store: item.store, status: "Weekly results" }))
    : commitments.map((item) => ({ store: item.store, status: item.overall_status }));
  const refreshCurrentView = () => dashboardMode === "details" ? loadWeeklyMetrics() : loadCommitments();

  const levelControls = access.canViewAll && (
    <div className="kpi-view-switcher" role="tablist" aria-label="KPI view level">
      <button role="tab" aria-selected={viewLevel === "company"} className={viewLevel === "company" ? "active" : ""} onClick={() => setViewLevel("company")}><Building2 size={18} /><span>Whole company<small>All visible stores</small></span></button>
      <button role="tab" aria-selected={viewLevel === "supervisor"} className={viewLevel === "supervisor" ? "active" : ""} onClick={() => setViewLevel("supervisor")} disabled={!access.supervisorGroups.length}><Users size={18} /><span>Supervisor view<small>Compare area groups</small></span></button>
      <button role="tab" aria-selected={viewLevel === "store"} className={viewLevel === "store" ? "active" : ""} onClick={() => setViewLevel("store")}><Store size={18} /><span>Individual store<small>Detailed weekly plan</small></span></button>
    </div>
  );

  return (
    <div className="page kpi-page">
      <section className="page-heading heading-with-action">
        <div><p className="eyebrow">Performance command center</p><h1>KPI Dashboard</h1><p>Compare the company, focus on a supervisor group, or open one store’s weekly plan.</p></div>
        <div className="kpi-week-controls"><label>Week ending<input type="date" value={weekEnd} onChange={(event) => setWeekEnd(event.target.value)} /></label><button className="button secondary" onClick={() => void refreshCurrentView()} disabled={currentLoading}><RefreshCw size={17} /> Refresh</button></div>
      </section>

      {error && <p className="inline-message kpi-error">{error}</p>}
      {message && <p className="inline-message"><CheckCircle2 size={17} /> {message}</p>}

      <div className="kpi-dashboard-mode" role="tablist" aria-label="Dashboard detail">
        <button role="tab" aria-selected={dashboardMode === "commitments"} className={dashboardMode === "commitments" ? "active" : ""} onClick={() => setDashboardMode("commitments")}><LayoutList size={18} /><span>Commitments<small>Goals, status, and action plans</small></span></button>
        <button role="tab" aria-selected={dashboardMode === "details"} className={dashboardMode === "details" ? "active" : ""} onClick={() => setDashboardMode("details")}><TableProperties size={18} /><span>Weekly metric totals<small>Every imported KPI in one view</small></span></button>
      </div>

      {levelControls}
      {viewLevel === "supervisor" && access.canViewAll && (
        <section className="kpi-scope-bar"><label>Supervisor group<select value={selectedGroup?.id ?? ""} onChange={(event) => setSelectedSupervisor(event.target.value)}>{access.supervisorGroups.map((group) => <option value={group.id} key={group.id}>{group.name} · {group.stores.length} stores</option>)}</select></label><p>Showing {selectedGroup?.stores.join(", ") || "no assigned stores"}</p></section>
      )}
      {viewLevel === "store" && storeTabs.length > 0 && (
        <div className="kpi-store-tabs" role="tablist" aria-label="Store selection">{storeTabs.map((item) => <button role="tab" aria-selected={selectedStore === item.store} className={selectedStore === item.store ? "active" : ""} key={item.store} onClick={() => setSelectedStore(item.store)}>{storeLabel(item.store)}<span>{item.status}</span></button>)}</div>
      )}

      {currentLoading ? (
        <div className="empty-card"><RefreshCw className="spin" /><h2>{dashboardMode === "details" ? "Loading weekly KPI results…" : "Loading KPI commitments…"}</h2></div>
      ) : dashboardMode === "details" ? (
        weeklyMetricsError ? (
          <div className="empty-card"><TableProperties /><h2>Detailed metrics are not connected yet</h2><p>{weeklyMetricsError}</p><p>Update both the Google Apps Script bridge and the Supabase KPI Edge Function, then refresh this page.</p></div>
        ) : scopedWeeklyMetrics.length === 0 ? (
          <div className="empty-card"><TableProperties /><h2>No weekly metrics found</h2><p>The KPI Database does not contain visible rows for this week and selection.</p></div>
        ) : (
          <>
            {weeklyMetricGroups.map((group) => (
              <section className="kpi-metric-section" key={group}>
                <div className="section-heading"><div><p className="eyebrow">Weekly totals</p><h2>{group}</h2></div></div>
                <div className="kpi-metric-total-grid">{detailTotals.filter((metric) => metric.group === group).map((metric) => <article key={metric.key}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></article>)}</div>
              </section>
            ))}
            <section className="panel table-panel kpi-detail-table">
              <div className="table-toolbar"><div><p className="eyebrow">Selected week</p><h2>All imported metrics by store</h2><p>Every field uploaded to the KPI Database for the selected week.</p></div></div>
              <div className="responsive-table"><table><thead><tr><th>Store</th>{weeklyMetricDefinitions.map((metric) => <th key={metric.key}>{metric.label}</th>)}</tr></thead><tbody>{[...scopedWeeklyMetrics].sort((a, b) => a.store.localeCompare(b.store, undefined, { numeric: true })).map((item) => <tr key={item.store}><td><button className="kpi-store-link" onClick={() => { setSelectedStore(item.store); setViewLevel("store"); }}>{storeLabel(item.store)}</button></td>{weeklyMetricDefinitions.map((metric) => <td key={metric.key}>{displayMetricValue(item.metrics, metric)}</td>)}</tr>)}</tbody></table></div>
            </section>
          </>
        )
      ) : commitments.length === 0 ? (
        <>
          {scopedForecasts.length > 0 && <section className="kpi-forecast-summary"><article><span>Shared sales forecast</span><strong>{formatCurrency(projectedSalesTotal, 2)}</strong><small>{scopedForecasts.length} store{scopedForecasts.length === 1 ? "" : "s"} generated</small></article><article><span>Expected range</span><strong>{formatCurrency(projectedLowTotal, 0)}–{formatCurrency(projectedHighTotal, 0)}</strong><small>Confidence-adjusted range</small></article><article><span>Forecast confidence</span><strong>{averageForecastConfidence.toFixed(0)}%</strong><small>Average across this view</small></article></section>}
          <div className="empty-card"><Target /><h2>{scopedForecasts.length > 0 ? "Forecast ready; actuals not posted yet" : "No commitments found"}</h2><p>{scopedForecasts.length > 0 ? "This future week is using the shared Labor and KPI forecast. KPI actuals and commitments will appear after weekly data is imported." : "There are no visible store rows for this week, or your store assignment still needs to be configured."}</p></div>
        </>
      ) : (
        <>
          {scopedForecasts.length > 0 && <section className="kpi-forecast-summary"><article><span>Shared sales forecast</span><strong>{formatCurrency(projectedSalesTotal, 2)}</strong><small>{scopedForecasts.length} store{scopedForecasts.length === 1 ? "" : "s"} generated</small></article><article><span>Expected range</span><strong>{formatCurrency(projectedLowTotal, 0)}–{formatCurrency(projectedHighTotal, 0)}</strong><small>Confidence-adjusted range</small></article><article><span>Forecast confidence</span><strong>{averageForecastConfidence.toFixed(0)}%</strong><small>Average across this view</small></article></section>}
          <section className="kpi-summary-grid"><article><BarChart3 size={21} /><span>{viewLevel === "supervisor" ? "Group stores" : viewLevel === "store" ? "Selected store" : "Company stores"}</span><strong>{scopedCommitments.length}</strong></article><article><Target size={21} /><span>Goals achieved</span><strong>{measuredGoals ? `${goalsMet}/${measuredGoals}` : "Pending"}</strong></article><article><Trophy size={21} /><span>Current leader</span><strong className="kpi-leader">{rankings[0] && score(rankings[0]).percent !== null ? storeLabel(rankings[0].store) : "Pending"}</strong></article></section>
          {viewLevel !== "store" ? (
            <section className="panel table-panel kpi-leaderboard"><div className="table-toolbar"><div><p className="eyebrow">Friendly competition</p><h2>{viewLevel === "company" ? "Company leaderboard" : `${selectedGroup?.name ?? "Supervisor"} leaderboard`}</h2><p>Ranked by the share of measured weekly goals achieved.</p></div></div><div className="responsive-table"><table><thead><tr><th>Rank</th><th>Store</th><th>Goal score</th><th>Forecast</th><th>Confidence</th><th>Sales</th><th>Labor</th><th>Load</th><th>ADT</th><th>Overall</th></tr></thead><tbody>{rankings.map((item, index) => { const itemScore = score(item); const forecast = forecastsByStore.get(item.store); return <tr key={item.store}><td><span className={`rank-badge rank-${index + 1}`}>{index + 1}</span></td><td><button className="kpi-store-link" onClick={() => { setSelectedStore(item.store); setViewLevel("store"); }}>{storeLabel(item.store)}</button></td><td><strong>{itemScore.percent === null ? "Pending" : `${itemScore.percent}%`}</strong><small className="kpi-score-detail">{itemScore.hits} of {itemScore.total} measured</small></td><td>{forecast ? formatCurrency(Number(forecast.weekly_projection.projected_sales || 0), 2) : "Not generated"}</td><td>{forecast ? <span className={`forecast-confidence ${forecast.confidence_level}`}>{forecast.confidence_score.toFixed(0)}%</span> : "—"}</td><td>{displayCommitmentValue("Sales", item.sales.actual, "Pending")}</td><td>{displayCommitmentValue("Labor", item.labor.actual, "Pending")}</td><td>{displayCommitmentValue("Load", item.load.actual, "Pending")}</td><td>{displayCommitmentValue("ADT", item.adt.actual, "Pending")}</td><td><span className={`kpi-overall ${item.overall_status.toLowerCase().replaceAll(" ", "-")}`}>{item.overall_status || "Pending"}</span></td></tr>; })}</tbody></table></div></section>
          ) : selected && (
            <div className="kpi-layout">
              <section className="panel table-panel kpi-results"><div className="table-toolbar"><div><p className="eyebrow">{storeLabel(selected.store)}</p><h2>Weekly performance plan</h2></div><span className={`kpi-overall ${selected.overall_status.toLowerCase().replaceAll(" ", "-")}`}>{selected.overall_status}</span></div><div className="responsive-table"><table><thead><tr><th>Metric</th><th>Trajectory</th><th>Suggested</th><th>Final goal</th><th>Actual</th><th>Status</th></tr></thead><tbody>{metrics.map(([name, trajectory, suggested, finalGoal, actual, status]) => <tr key={name}><td><strong>{name}</strong></td><td>{displayCommitmentValue(name, trajectory, "—")}</td><td>{displayCommitmentValue(name, suggested, "—")}</td><td><strong>{displayCommitmentValue(name, finalGoal, "—")}</strong></td><td>{displayCommitmentValue(name, actual, "Pending")}</td><td><span className={`kpi-status ${String(status).toLowerCase()}`}>{status || "Pending"}</span></td></tr>)}</tbody></table></div></section>
              <form className="panel kpi-editor" onSubmit={save}>
                <div className="panel-heading"><div><p className="eyebrow">Supervisor commitment</p><h2>Set the weekly plan</h2></div><Target size={23} /></div>
                <div className="kpi-goal-grid">
                  <label>Sales goal<div className="kpi-input-affix prefix"><span>$</span><input type="number" step="1" value={draft.supervisor_sales_goal} disabled={!canEditSelected} onChange={(event) => setDraft({ ...draft, supervisor_sales_goal: event.target.value })} /></div></label>
                  <label>Labor goal<div className="kpi-input-affix suffix"><input type="number" step="0.1" value={draft.supervisor_labor_goal} disabled={!canEditSelected} onChange={(event) => setDraft({ ...draft, supervisor_labor_goal: event.target.value })} /><span>%</span></div></label>
                  <label>SPLH goal<div className="kpi-input-affix prefix"><span>$</span><input type="number" step="0.01" value={draft.supervisor_splh_goal} disabled={!canEditSelected} onChange={(event) => setDraft({ ...draft, supervisor_splh_goal: event.target.value })} /></div></label>
                  <label>Food variance goal<div className="kpi-input-affix suffix"><input type="number" step="0.1" value={draft.supervisor_food_variance_goal} disabled={!canEditSelected} onChange={(event) => setDraft({ ...draft, supervisor_food_variance_goal: event.target.value })} /><span>%</span></div></label>
                  <label>Load goal<input type="number" step="0.1" value={draft.supervisor_load_goal} disabled={!canEditSelected} onChange={(event) => setDraft({ ...draft, supervisor_load_goal: event.target.value })} /></label>
                  <label>ADT goal<input type="number" step="0.1" value={draft.supervisor_adt_goal} disabled={!canEditSelected} onChange={(event) => setDraft({ ...draft, supervisor_adt_goal: event.target.value })} /></label>
                </div>
                <label>Focus area<select value={draft.focus_area} disabled={!canEditSelected} onChange={(event) => setDraft({ ...draft, focus_area: event.target.value })}><option value="">Select a focus</option>{focusAreas.map((area) => <option key={area}>{area}</option>)}</select></label>
                <label>Owner<input value={draft.owner} disabled={!canEditSelected} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} placeholder="Person accountable for the plan" /></label>
                <label>Action plan<textarea rows={5} value={draft.action_plan} disabled={!canEditSelected} onChange={(event) => setDraft({ ...draft, action_plan: event.target.value })} placeholder="What will the store do differently this week?" /></label>
                {canEditSelected ? <button className="button primary full" disabled={saving}><Save size={17} />{saving ? "Saving to Google Sheets…" : "Save commitment"}</button> : <p className="security-note">You can compare this store, but only administrators or the assigned supervisor can edit its goals.</p>}
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}
