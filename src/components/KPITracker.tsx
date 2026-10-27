import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
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
import { rankStores, rankingMetrics, summarizeGroup, type StoreRanking } from "../../supabase/functions/kpi-dashboard/analytics";

import KPITrends from './KPITrends';
import './kpi-planning.css';
import KPIRegionalPlans from './KPIRegionalPlans';
import { planningWeek } from '../../supabase/functions/kpi-dashboard/goals';

type KpiMetric = {
  trajectory: string;
  suggested_goal: string;
  supervisor_goal: number | null;
  actual: string;
  final_goal: string;
  status: string;
  previous_goal?: string;
  previous_goal_source?: "saved" | "automatic";
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
    previous_goal?: string;
    previous_goal_source?: "saved" | "automatic";
  };
  accountability: { focus_area: string; action_plan: string; owner: string };
  labor: KpiMetric;
  splh: KpiMetric;
  food_variance: KpiMetric;
  load: KpiMetric;
  adt: KpiMetric;
  extreme_orders: { actual: string; goal?: string; variance?: string; status: string };
  overall_status: string;
  uses_automatic_previous_goals?: boolean;
};

type SupervisorGroup = { id: string; name: string; stores: string[]; store_ids?: string[]; summary?: ReturnType<typeof summarizeGroup> };
type KpiAccess = {
  canEdit: boolean;
  canViewAll: boolean;
  editableStores: string[] | null;
  assignedStores: string[];
  supervisorGroups: SupervisorGroup[];
};
type ViewLevel = "company" | "supervisor" | "store";
type DashboardMode = "commitments" | "details" | "trends" | "plans";
type WeeklyMetricRow = {
  store_id?: string;
  store: string;
  week_end: string;
  metrics: Record<string, unknown>;
};
type HistoricalKpiResult = {
  store_id: string;
  week_end: string;
  metrics: Record<string, unknown>;
};
type SharedForecast = {
  store_id: string;
  store: string;
  week_start: string;
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
type WeeklyMetricSort = { key: "store" | string; direction: "asc" | "desc" };
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

function storeNumberValue(store: string) {
  const parsed = Number(store.replace(/^Store\s+/i, "").split(" · ")[0]);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function mostRecentCompletedSunday() { return addIsoDays(planningWeek(), -7); }

function addIsoDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatWeekRange(start: string, end: string) {
  const format = (value: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
  return `${format(start)}–${format(end)}`;
}

function demoMetric(trajectory: string, suggested: string, supervisor: number): KpiMetric {
  return { trajectory, suggested_goal: suggested, supervisor_goal: supervisor, actual: "Pending", final_goal: suggested, status: "Pending", previous_goal: suggested };
}

const demoCommitments: Commitment[] = [
  {
    row_number: 4,
    week_end: mostRecentCompletedSunday(),
    store: "1412",
    sales: { model_projection: "$37,381", recommended_goal: "$38,100", supervisor_goal: 39000, actual: "$39,420", final_goal: "$39,000", variance: "$420", variance_percent: "1.1%", status: "Yes", previous_goal: "$39,000" },
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
    sales: { model_projection: "$31,200", recommended_goal: "$31,700", supervisor_goal: 32000, actual: "$31,810", final_goal: "$32,000", variance: "-$190", variance_percent: "-0.6%", status: "No", previous_goal: "$32,000" },
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

function commitmentReviewRows(item: Commitment) {
  return [
    { name: "Sales", previous: item.sales.previous_goal, previousSource: item.sales.previous_goal_source, actual: item.sales.actual, next: item.sales.final_goal, status: item.sales.status },
    { name: "Labor", previous: item.labor.previous_goal, previousSource: item.labor.previous_goal_source, actual: item.labor.actual, next: item.labor.final_goal, status: item.labor.status },
    { name: "SPLH", previous: item.splh.previous_goal, previousSource: item.splh.previous_goal_source, actual: item.splh.actual, next: item.splh.final_goal, status: item.splh.status },
    { name: "Food variance", previous: item.food_variance.previous_goal, previousSource: item.food_variance.previous_goal_source, actual: item.food_variance.actual, next: item.food_variance.final_goal, status: item.food_variance.status },
    { name: "Load", previous: item.load.previous_goal, previousSource: item.load.previous_goal_source, actual: item.load.actual, next: item.load.final_goal, status: item.load.status },
    { name: "ADT", previous: item.adt.previous_goal, previousSource: item.adt.previous_goal_source, actual: item.adt.actual, next: item.adt.final_goal, status: item.adt.status },
  ];
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

function metricPerformance(metricName: string, actualText: string, goal: number | null) {
  const actual = numericValue(actualText);
  if (actual === null || goal === null) return "pending" as const;
  const isPercent = metricName === "Labor" || metricName === "Food variance";
  const normalizedActual = isPercent && Math.abs(actual) <= 1 ? actual * 100 : actual;
  const normalizedGoal = isPercent && Math.abs(goal) <= 1 ? goal * 100 : goal;
  const lowerIsBetter = ["Labor", "Food variance", "Load", "ADT"].includes(metricName);
  const tolerance: Record<string, number> = { Sales: 500, Labor: 0.3, SPLH: 1, "Food variance": 0.2, Load: 0.5, ADT: 0.5 };
  const difference = lowerIsBetter ? normalizedActual - normalizedGoal : normalizedGoal - normalizedActual;
  if (difference <= 0) return "hit" as const;
  return difference <= (tolerance[metricName] ?? 0) ? "close" as const : "miss" as const;
}

function goalStatus(metricName: string, actualText: string, goal: number | null) {
  const band = metricPerformance(metricName, actualText, goal);
  return band === "hit" ? "Yes" : band === "close" ? "Close" : band === "miss" ? "No" : "Pending";
}

function statusClass(status: string) {
  const normalized = status.toLowerCase();
  if (["yes", "met", "goals met", "on track"].includes(normalized)) return "hit";
  if (normalized === "close") return "close";
  if (normalized === "no") return "miss";
  return "pending";
}

function weightedAverage(values: number[]) {
  if (!values.length) return null;
  const denominator = values.reduce((sum, _value, index) => sum + index + 1, 0);
  return values.reduce((sum, value, index) => sum + value * (index + 1), 0) / denominator;
}

function projectedTrajectory(history: HistoricalKpiResult[], key: string) {
  const values = history
    .map((row) => numericValue(row.metrics[key]))
    .filter((value): value is number => value !== null)
    .slice(-8);
  if (!values.length) return null;
  if (values.length === 1) return values[0];
  const xAverage = (values.length - 1) / 2;
  const yAverage = values.reduce((sum, value) => sum + value, 0) / values.length;
  const numerator = values.reduce((sum, value, index) => sum + (index - xAverage) * (value - yAverage), 0);
  const denominator = values.reduce((sum, _value, index) => sum + ((index - xAverage) ** 2), 0);
  const slope = denominator ? numerator / denominator : 0;
  const recentAverage = weightedAverage(values) ?? values.at(-1)!;
  const predicted = recentAverage + slope * 0.65;
  const range = Math.max(Math.abs(recentAverage) * 0.12, Math.max(...values) - Math.min(...values));
  return Math.max(recentAverage - range, Math.min(recentAverage + range, predicted));
}

function suggestedGoal(history: HistoricalKpiResult[], key: string, trajectory: number | null, lowerIsBetter: boolean, minimumStep: number) {
  if (trajectory === null) return null;
  const values = history
    .map((row) => numericValue(row.metrics[key]))
    .filter((value): value is number => value !== null)
    .slice(-6);
  if (!values.length) return trajectory;
  const recentAverage = weightedAverage(values) ?? trajectory;
  const best = lowerIsBetter ? Math.min(...values) : Math.max(...values);
  const step = Math.max(Math.abs(recentAverage) * 0.01, minimumStep);
  if (lowerIsBetter) {
    const improved = Math.min(trajectory, recentAverage) - step;
    return Math.min(trajectory, Math.max(improved, best * 0.98));
  }
  const improved = Math.max(trajectory, recentAverage) + step;
  return Math.max(trajectory, Math.min(improved, best * 1.02));
}

function roundedGoal(value: number | null, increment: number) {
  if (value === null) return "";
  return String(Math.round(value / increment) * increment);
}

function preciseGoal(value: number | null, decimals: number) {
  if (value === null) return "";
  return String(Number(value.toFixed(decimals)));
}

function databaseCommitment(
  result: { store_id: string; week_end: string; metrics: Record<string, unknown>; stores?: { name?: string } | Array<{ name?: string }> | null },
  goalRow?: { goals?: Record<string, unknown>; focus_area?: string; action_plan?: string; owner?: string },
  previousGoalRow?: { goals?: Record<string, unknown> },
  history: HistoricalKpiResult[] = [],
  forecast?: { weekly_projection?: { projected_sales?: number } } | null,
  automatic: Record<string, unknown> = {},
  priorAutomatic: Record<string, unknown> = {},
): Commitment {
  const metrics = result.metrics ?? {};
  const goals = goalRow?.goals ?? {};
  const previousGoals = previousGoalRow?.goals ?? {};
  const storeName = Array.isArray(result.stores) ? result.stores[0]?.name : result.stores?.name;
  const store = metricText(metrics, "store_number", storeName ?? "Store").replace(/^Store\s+/i, "").split(" · ")[0];
  const salesGoal = goalValue(goals, "sales");
  const laborGoal = goalValue(goals, "labor");
  const splhGoal = goalValue(goals, "splh");
  const foodGoal = goalValue(goals, "food_variance");
  const loadGoal = goalValue(goals, "load");
  const adtGoal = goalValue(goals, "adt");
  const savedPreviousSalesGoal = goalValue(previousGoals, "sales");
  const savedPreviousLaborGoal = goalValue(previousGoals, "labor");
  const savedPreviousSplhGoal = goalValue(previousGoals, "splh");
  const savedPreviousFoodGoal = goalValue(previousGoals, "food_variance");
  const savedPreviousLoadGoal = goalValue(previousGoals, "load");
  const savedPreviousAdtGoal = goalValue(previousGoals, "adt");
  const salesActual = metricText(metrics, "royalty_sales", "Pending");
  const laborActual = metricText(metrics, "labor_percent", "Pending");
  const splhActual = metricText(metrics, "splh", "Pending");
  const foodActual = metricText(metrics, "food_difference_percent", "Pending");
  const loadActual = metricText(metrics, "avg_load", "Pending");
  const adtActual = metricText(metrics, "avg_adt", "Pending");
  const salesTrajectoryValue = Number(forecast?.weekly_projection?.projected_sales) || projectedTrajectory(history, "royalty_sales");
  const laborTrajectoryValue = projectedTrajectory(history, "labor_percent");
  const splhTrajectoryValue = projectedTrajectory(history, "splh");
  const foodTrajectoryValue = projectedTrajectory(history, "food_difference_percent");
  const loadTrajectoryValue = projectedTrajectory(history, "avg_load");
  const adtTrajectoryValue = projectedTrajectory(history, "avg_adt");
  const priorHistory = history.filter((row) => row.week_end < result.week_end);
  const resolvePreviousGoal = (saved: number | null, automatic: string) => {
    if (saved !== null) return { value: saved, source: "saved" as const };
    const fallback = numericValue(automatic);
    return { value: fallback, source: fallback === null ? undefined : "automatic" as const };
  };
  const previousSalesGoal = resolvePreviousGoal(savedPreviousSalesGoal, priorAutomatic.sales === null ? "" : priorAutomatic.sales !== undefined ? String(priorAutomatic.sales) : roundedGoal(projectedTrajectory(priorHistory, "royalty_sales"), 100));
  const previousLaborTrajectory = projectedTrajectory(priorHistory, "labor_percent");
  const previousSplhTrajectory = projectedTrajectory(priorHistory, "splh");
  const previousFoodTrajectory = projectedTrajectory(priorHistory, "food_difference_percent");
  const previousLoadTrajectory = projectedTrajectory(priorHistory, "avg_load");
  const previousAdtTrajectory = projectedTrajectory(priorHistory, "avg_adt");
  const previousLaborGoal = resolvePreviousGoal(savedPreviousLaborGoal, priorAutomatic.labor === null ? "" : priorAutomatic.labor !== undefined ? String(priorAutomatic.labor) : preciseGoal(suggestedGoal(priorHistory, "labor_percent", previousLaborTrajectory, true, 0.002), 4));
  const previousSplhGoal = resolvePreviousGoal(savedPreviousSplhGoal, priorAutomatic.splh === null ? "" : priorAutomatic.splh !== undefined ? String(priorAutomatic.splh) : preciseGoal(suggestedGoal(priorHistory, "splh", previousSplhTrajectory, false, 0.25), 2));
  const previousFoodGoal = resolvePreviousGoal(savedPreviousFoodGoal, priorAutomatic.food_variance === null ? "" : priorAutomatic.food_variance !== undefined ? String(priorAutomatic.food_variance) : preciseGoal(suggestedGoal(priorHistory, "food_difference_percent", previousFoodTrajectory, true, 0.001), 4));
  const previousLoadGoal = resolvePreviousGoal(savedPreviousLoadGoal, priorAutomatic.load === null ? "" : priorAutomatic.load !== undefined ? String(priorAutomatic.load) : preciseGoal(suggestedGoal(priorHistory, "avg_load", previousLoadTrajectory, true, 0.1), 2));
  const previousAdtGoal = resolvePreviousGoal(savedPreviousAdtGoal, priorAutomatic.adt === null ? "" : priorAutomatic.adt !== undefined ? String(priorAutomatic.adt) : preciseGoal(suggestedGoal(priorHistory, "avg_adt", previousAdtTrajectory, true, 0.25), 2));
  const salesSuggested = automatic.sales === null ? "" : automatic.sales !== undefined ? String(automatic.sales) : roundedGoal(salesTrajectoryValue, 100);
  const laborSuggested = automatic.labor === null ? "" : automatic.labor !== undefined ? String(automatic.labor) : preciseGoal(suggestedGoal(history, "labor_percent", laborTrajectoryValue, true, 0.002), 4);
  const splhSuggested = automatic.splh === null ? "" : automatic.splh !== undefined ? String(automatic.splh) : preciseGoal(suggestedGoal(history, "splh", splhTrajectoryValue, false, 0.25), 2);
  const foodSuggested = automatic.food_variance === null ? "" : automatic.food_variance !== undefined ? String(automatic.food_variance) : preciseGoal(suggestedGoal(history, "food_difference_percent", foodTrajectoryValue, true, 0.001), 4);
  const loadSuggested = automatic.load === null ? "" : automatic.load !== undefined ? String(automatic.load) : preciseGoal(suggestedGoal(history, "avg_load", loadTrajectoryValue, true, 0.1), 2);
  const adtSuggested = automatic.adt === null ? "" : automatic.adt !== undefined ? String(automatic.adt) : preciseGoal(suggestedGoal(history, "avg_adt", adtTrajectoryValue, true, 0.25), 2);
  const metric = (name: string, trajectory: string, suggested: string, supervisor: number | null, previousGoal: { value: number | null; source?: "saved" | "automatic" }, actual: string): KpiMetric => ({
    trajectory, suggested_goal: suggested, supervisor_goal: supervisor,
    actual, final_goal: supervisor === null ? suggested : String(supervisor),
    previous_goal: previousGoal.value === null ? "" : String(previousGoal.value),
    previous_goal_source: previousGoal.source,
    status: goalStatus(name, actual, previousGoal.value),
  });
  const commitment: Commitment = {
    store_id: result.store_id, source: "database", row_number: 0, week_end: result.week_end, store,
    sales: {
      model_projection: preciseGoal(salesTrajectoryValue, 2),
      recommended_goal: salesSuggested,
      supervisor_goal: salesGoal,
      actual: salesActual,
      final_goal: salesGoal === null ? salesSuggested : String(salesGoal),
      variance: "", variance_percent: "", previous_goal: previousSalesGoal.value === null ? "" : String(previousSalesGoal.value), previous_goal_source: previousSalesGoal.source, status: goalStatus("Sales", salesActual, previousSalesGoal.value),
    },
    accountability: { focus_area: goalRow?.focus_area ?? "", action_plan: goalRow?.action_plan ?? "", owner: goalRow?.owner ?? "" },
    labor: metric("Labor", preciseGoal(laborTrajectoryValue, 4), laborSuggested, laborGoal, previousLaborGoal, laborActual),
    splh: metric("SPLH", preciseGoal(splhTrajectoryValue, 2), splhSuggested, splhGoal, previousSplhGoal, splhActual),
    food_variance: metric("Food variance", preciseGoal(foodTrajectoryValue, 4), foodSuggested, foodGoal, previousFoodGoal, foodActual),
    load: metric("Load", preciseGoal(loadTrajectoryValue, 2), loadSuggested, loadGoal, previousLoadGoal, loadActual),
    adt: metric("ADT", preciseGoal(adtTrajectoryValue, 2), adtSuggested, adtGoal, previousAdtGoal, adtActual),
    extreme_orders: { actual: metricText(metrics, "extreme_order_percent", "Pending"), goal: metricText(metrics, "extreme_order_goal", "1.0%"), status: "Pending" },
    overall_status: "Pending",
    uses_automatic_previous_goals: [previousSalesGoal, previousLaborGoal, previousSplhGoal, previousFoodGoal, previousLoadGoal, previousAdtGoal].some((goal) => goal.source === "automatic"),
  };
  const statuses = [commitment.sales.status, commitment.labor.status, commitment.splh.status, commitment.food_variance.status, commitment.load.status, commitment.adt.status];
  commitment.overall_status = statuses.some((status) => status === "No") ? "Needs Follow-Up" : statuses.some((status) => status === "Close") ? "Close" : statuses.some((status) => status === "Yes") ? "Goals Met" : "Pending";
  return commitment;
}

export default function KPITracker({ profile }: { profile: Profile }) {
  const [reportDirty,setReportDirty]=useState(false);
  const [historyRows,setHistoryRows]=useState<HistoricalKpiResult[]>([]);
  const [trendStores,setTrendStores]=useState<{id:string;name:string;store_number:string|null}[]>([]);
  const [weekEnd, setWeekEnd] = useState(mostRecentCompletedSunday());
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [weeklyMetrics, setWeeklyMetrics] = useState<WeeklyMetricRow[]>([]);
  const [sharedForecasts, setSharedForecasts] = useState<SharedForecast[]>([]);
  const [nextWeekForecasts, setNextWeekForecasts] = useState<SharedForecast[]>([]);
  const [currentGoalCount, setCurrentGoalCount] = useState(0);
  const [weeklyMetricsError, setWeeklyMetricsError] = useState("");
  const [selectedStore, setSelectedStore] = useState("");
  const [selectedSupervisor, setSelectedSupervisor] = useState("");
  const [companyRankings, setCompanyRankings] = useState<StoreRanking[]>([]);
  const [companyStoreCount, setCompanyStoreCount] = useState(0);
  const requestId = useRef(0);
  const [viewLevel, setViewLevel] = useState<ViewLevel>(profile.role === "supervisor" || profile.role === "admin" ? "company" : "store");
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>("commitments");
  const [weeklyMetricSort, setWeeklyMetricSort] = useState<WeeklyMetricSort>({ key: "store", direction: "asc" });
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

  const selected = useMemo(() => commitments.find((item) => item.store === selectedStore), [commitments, selectedStore]);
  const selectedGroup = profile.role === "supervisor"
    ? access.supervisorGroups.find((group) => group.id === profile.id)
    : access.supervisorGroups.find((group) => group.id === selectedSupervisor) ?? access.supervisorGroups[0];
  const scopedCommitments = useMemo(() => {
    if (viewLevel === "supervisor") return commitments.filter((item) => selectedGroup?.stores.includes(item.store));
    if (viewLevel === "store") return selected ? [selected] : [];
    return commitments;
  }, [commitments, selected, selectedGroup, viewLevel]);
  const scopedWeeklyMetrics = useMemo(() => {
    if (viewLevel === "supervisor") return weeklyMetrics.filter((item) => selectedGroup?.stores.includes(item.store));
    if (viewLevel === "store" && selectedStore) return weeklyMetrics.filter((item) => item.store === selectedStore);
    return weeklyMetrics;
  }, [weeklyMetrics, selectedStore, selectedGroup, viewLevel]);
  const canEditSelected = Boolean(selected && weekEnd === mostRecentCompletedSunday() && access.canEdit && (access.editableStores === null || access.editableStores.includes(selected.store)));

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

  const loadDashboard = async () => {
    const request = ++requestId.current;
    setCommitmentsLoading(true); setMetricsLoading(true);
    setError(""); setWeeklyMetricsError("");
    setCommitments([]); setWeeklyMetrics([]); setCompanyRankings([]);
    setCompanyStoreCount(0); setHistoryRows([]); setTrendStores([]);
    setAccess((current) => ({ ...current, supervisorGroups: [] }));
    setSharedForecasts([]); setNextWeekForecasts([]); setCurrentGoalCount(0);
    if (!isSupabaseConfigured || !supabase) {
      const demo = demoCommitments.map((item) => ({ ...item, week_end: weekEnd }));
      const results = demoWeeklyMetrics.map((item) => ({ ...item, store_id: item.store, week_end: weekEnd }));
      const stores = results.map((item) => ({ id: item.store, name: storeLabel(item.store), store_number: item.store }));
      setHistoryRows(results as HistoricalKpiResult[]); setTrendStores(stores);
      setCommitments(demo); setWeeklyMetrics(results); setCompanyRankings(rankStores(stores, results)); setCompanyStoreCount(stores.length);
      setSelectedStore((current) => current || demo[0]?.store || "");
      applyAccess({ canEdit: true, canViewAll: true, editableStores: null, assignedStores: stores.map((store) => store.id), supervisorGroups: [
        { id: profile.role === "supervisor" ? profile.id : "demo-north", name: "North Area", stores: stores.slice(0,1).map((store) => store.id), summary: summarizeGroup(results.slice(0,1)) },
        { id: "demo-south", name: "South Area", stores: stores.slice(1).map((store) => store.id), summary: summarizeGroup(results.slice(1)) },
      ] });
      setCommitmentsLoading(false); setMetricsLoading(false); return;
    }
    const { data, error: loadError } = await supabase.functions.invoke("kpi-dashboard", { body: { week_end: weekEnd } });
    if (request !== requestId.current) return;
    if (loadError || !data?.ok) {
      setError(data?.error || loadError?.message || "The KPI dashboard could not be loaded.");
      setCommitmentsLoading(false); setMetricsLoading(false); return;
    }
    applyAccess(accessFromResponse(data));
    const resultRows = data.results as Array<Parameters<typeof databaseCommitment>[0]>;
    const goals = data.goals as Array<{ store_id: string; week_end: string; goals: Record<string, unknown>; focus_area: string; action_plan: string; owner: string }>;
    const history = data.history as HistoricalKpiResult[];
    setHistoryRows(history); setTrendStores(data.stores);
    const autos = (data.automatic_goals ?? []) as {store_id:string;week_end:string;goals:Record<string,unknown>}[];
    const forecasts = data.forecasts as SharedForecast[];
    const rows = resultRows.map((item) => databaseCommitment(item,
      goals.find((goal) => goal.store_id === item.store_id && goal.week_end === addIsoDays(weekEnd, 7)),
      goals.find((goal) => goal.store_id === item.store_id && goal.week_end === weekEnd),
      history.filter((row) => row.store_id === item.store_id),
      forecasts.find((forecast) => forecast.store_id === item.store_id && forecast.week_start === addIsoDays(weekEnd, 1)),
      autos.find(a=>a.store_id===item.store_id&&a.week_end===addIsoDays(weekEnd,7))?.goals,
      autos.find(a=>a.store_id===item.store_id&&a.week_end===weekEnd)?.goals,
    ));
    setCommitments(rows);
    setWeeklyMetrics(resultRows.map((row) => ({ store_id: row.store_id, store: String(row.metrics.store_number), week_end: row.week_end, metrics: row.metrics })));
    setCompanyRankings(data.rankings); setCompanyStoreCount(data.company_store_count);
    setSelectedStore((current) => data.rankings.some((row: StoreRanking) => row.store === current) ? current : data.rankings[0]?.store ?? "");
    setSharedForecasts(forecasts.filter((forecast) => forecast.week_start === addIsoDays(weekEnd, 1)));
    setNextWeekForecasts(forecasts.filter((forecast) => forecast.week_start === addIsoDays(weekEnd, 8)));
    setCurrentGoalCount(goals.filter((goal) => goal.week_end === addIsoDays(weekEnd, 7)).length);
    setCommitmentsLoading(false); setMetricsLoading(false);
  };

  useEffect(() => { void loadDashboard(); return () => { requestId.current += 1; }; }, [weekEnd, profile.id]);
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
        store_id: selected.store_id, week_end: addIsoDays(weekEnd, 7),
        goals: { sales: numeric(draft.supervisor_sales_goal), labor: percentage(draft.supervisor_labor_goal), splh: numeric(draft.supervisor_splh_goal), food_variance: percentage(draft.supervisor_food_variance_goal), load: numeric(draft.supervisor_load_goal), adt: numeric(draft.supervisor_adt_goal) },
        focus_area: draft.focus_area, action_plan: draft.action_plan, owner: draft.owner, updated_by: profile.id, updated_at: new Date().toISOString(),
      }, { onConflict: "store_id,week_end" });
      if (databaseError) { setError(databaseError.message); setSaving(false); return; }
      setMessage(`Store ${selected.store} goals saved for ${formatWeekRange(addIsoDays(weekEnd,1),addIsoDays(weekEnd,7))}. Completed results are unchanged.`); setSaving(false); await loadDashboard(); return;
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
    { name: "Sales", trajectory: selected.sales.model_projection, suggested: selected.sales.recommended_goal, finalGoal: selected.sales.final_goal, previousGoal: selected.sales.previous_goal, previousSource: selected.sales.previous_goal_source, actual: selected.sales.actual, status: selected.sales.status, overridden: selected.sales.supervisor_goal !== null },
    { name: "Labor", trajectory: selected.labor.trajectory, suggested: selected.labor.suggested_goal, finalGoal: selected.labor.final_goal, previousGoal: selected.labor.previous_goal, previousSource: selected.labor.previous_goal_source, actual: selected.labor.actual, status: selected.labor.status, overridden: selected.labor.supervisor_goal !== null },
    { name: "SPLH", trajectory: selected.splh.trajectory, suggested: selected.splh.suggested_goal, finalGoal: selected.splh.final_goal, previousGoal: selected.splh.previous_goal, previousSource: selected.splh.previous_goal_source, actual: selected.splh.actual, status: selected.splh.status, overridden: selected.splh.supervisor_goal !== null },
    { name: "Food variance", trajectory: selected.food_variance.trajectory, suggested: selected.food_variance.suggested_goal, finalGoal: selected.food_variance.final_goal, previousGoal: selected.food_variance.previous_goal, previousSource: selected.food_variance.previous_goal_source, actual: selected.food_variance.actual, status: selected.food_variance.status, overridden: selected.food_variance.supervisor_goal !== null },
    { name: "Load", trajectory: selected.load.trajectory, suggested: selected.load.suggested_goal, finalGoal: selected.load.final_goal, previousGoal: selected.load.previous_goal, previousSource: selected.load.previous_goal_source, actual: selected.load.actual, status: selected.load.status, overridden: selected.load.supervisor_goal !== null },
    { name: "ADT", trajectory: selected.adt.trajectory, suggested: selected.adt.suggested_goal, finalGoal: selected.adt.final_goal, previousGoal: selected.adt.previous_goal, previousSource: selected.adt.previous_goal_source, actual: selected.adt.actual, status: selected.adt.status, overridden: selected.adt.supervisor_goal !== null },
  ] : [];
  const rankings = ordered(scopedCommitments);
  const scopedForecasts = sharedForecasts.filter((forecast) => viewLevel === "company" || (viewLevel === "supervisor" && selectedGroup?.stores.includes(forecast.store)) || (viewLevel === "store" && forecast.store === selectedStore));
  const projectedSalesTotal = scopedForecasts.reduce((sum, forecast) => sum + Number(forecast.weekly_projection.projected_sales || 0), 0);
  const projectedLowTotal = scopedForecasts.reduce((sum, forecast) => sum + Number(forecast.weekly_projection.low_sales || 0), 0);
  const projectedHighTotal = scopedForecasts.reduce((sum, forecast) => sum + Number(forecast.weekly_projection.high_sales || 0), 0);
  const averageForecastConfidence = scopedForecasts.length ? scopedForecasts.reduce((sum, forecast) => sum + forecast.confidence_score, 0) / scopedForecasts.length : 0;
  const scopedNextForecasts = nextWeekForecasts.filter((forecast) => viewLevel === "company" || (viewLevel === "supervisor" && selectedGroup?.stores.includes(forecast.store)) || (viewLevel === "store" && forecast.store === selectedStore));
  const nextProjectedSalesTotal = scopedNextForecasts.reduce((sum, forecast) => sum + Number(forecast.weekly_projection.projected_sales || 0), 0);
  const nextAverageConfidence = scopedNextForecasts.length ? scopedNextForecasts.reduce((sum, forecast) => sum + forecast.confidence_score, 0) / scopedNextForecasts.length : 0;
  const goalsMet = scopedCommitments.reduce((total, item) => total + score(item).hits, 0);
  const measuredGoals = scopedCommitments.reduce((total, item) => total + score(item).total, 0);
  const detailTotals = weeklyMetricDefinitions.map((definition) => ({
    ...definition,
    value: formatMetricValue(aggregateMetric(scopedWeeklyMetrics, definition), definition.format),
    detail: definition.aggregate === "sum" ? "Total across selected stores" : "Store average",
  }));
  const sortedWeeklyMetrics = useMemo(() => {
    const rows = [...scopedWeeklyMetrics];
    return rows.sort((a, b) => {
      if (weeklyMetricSort.key === "store") return storeNumberValue(a.store) - storeNumberValue(b.store);
      const aValue = numericValue(a.metrics[weeklyMetricSort.key]);
      const bValue = numericValue(b.metrics[weeklyMetricSort.key]);
      if (aValue === null && bValue === null) return storeNumberValue(a.store) - storeNumberValue(b.store);
      if (aValue === null) return 1;
      if (bValue === null) return -1;
      const difference = aValue - bValue;
      return (weeklyMetricSort.direction === "asc" ? difference : -difference) || storeNumberValue(a.store) - storeNumberValue(b.store);
    });
  }, [scopedWeeklyMetrics, weeklyMetricSort]);
  const sortWeeklyMetrics = (key: string) => {
    if (key === "store") { setWeeklyMetricSort({ key: "store", direction: "asc" }); return; }
    setWeeklyMetricSort((current) => ({ key, direction: current.key === key && current.direction === "desc" ? "asc" : "desc" }));
  };
  const sortIcon = (key: string) => weeklyMetricSort.key !== key ? <ArrowUpDown size={14} /> : weeklyMetricSort.direction === "desc" ? <ArrowDown size={14} /> : <ArrowUp size={14} />;
  const currentLoading = dashboardMode === "details" ? metricsLoading : commitmentsLoading;
  const storeTabs = dashboardMode === "details"
    ? weeklyMetrics.map((item) => ({ store: item.store, status: "Weekly results" }))
    : commitments.map((item) => ({ store: item.store, status: item.overall_status }));
  const refreshCurrentView = () => loadDashboard();

  const levelControls = access.canViewAll && (
    <div className="kpi-view-switcher" role="tablist" aria-label="KPI view level">
      <button role="tab" aria-selected={viewLevel === "company"} className={viewLevel === "company" ? "active" : ""} onClick={() => setViewLevel("company")}><Building2 size={18} /><span>Whole company<small>All visible stores</small></span></button>
      <button role="tab" aria-selected={viewLevel === "supervisor"} className={viewLevel === "supervisor" ? "active" : ""} onClick={() => setViewLevel("supervisor")} ><Users size={18} /><span>Supervisor view<small>Compare area groups</small></span></button>
      <button role="tab" aria-selected={viewLevel === "store"} className={viewLevel === "store" ? "active" : ""} onClick={() => setViewLevel("store")}><Store size={18} /><span>Individual store<small>Detailed weekly plan</small></span></button>
    </div>
  );

  return (
    <div className="page kpi-page">
      <section className="page-heading heading-with-action">
        <div><p className="eyebrow">Performance command center</p><h1>KPI Dashboard</h1><p>Compare the company, focus on a supervisor group, or open one store’s weekly plan.</p></div>
        <div className="kpi-week-controls"><label>Results week ending<input type="date" value={weekEnd} onChange={(event) => setWeekEnd(event.target.value)} /></label><button className="button secondary" onClick={() => void refreshCurrentView()} disabled={currentLoading}><RefreshCw size={17} /> Refresh</button></div>
      </section>

      <section className="kpi-planning-horizon">
        <article className="actual"><span>Reviewing actuals</span><strong>{formatWeekRange(addIsoDays(weekEnd, -6), weekEnd)}</strong><small>Completed Monday–Sunday results</small></article>
        <article className="current"><span>Current week</span><strong>{formatWeekRange(addIsoDays(weekEnd, 1), addIsoDays(weekEnd, 7))}</strong><small>{sharedForecasts.length} forecasts · {currentGoalCount} goal plans</small></article>
        <article className="next"><span>Following week</span><strong>{formatWeekRange(addIsoDays(weekEnd, 8), addIsoDays(weekEnd, 14))}</strong><small>{nextWeekForecasts.length} advance forecasts</small></article>
      </section>

      {error && <p className="inline-message kpi-error">{error}</p>}
      {message && <p className="inline-message"><CheckCircle2 size={17} /> {message}</p>}

      <div className="kpi-dashboard-mode" role="tablist" aria-label="Dashboard detail">
        <button role="tab" aria-selected={dashboardMode === "commitments"} className={dashboardMode === "commitments" ? "active" : ""} onClick={() => (!reportDirty || window.confirm('Discard unsaved report changes?')) && setDashboardMode("commitments")}><LayoutList size={18} /><span>Commitments<small>Goals, status, and action plans</small></span></button>
        <button role="tab" aria-selected={dashboardMode === "details"} className={dashboardMode === "details" ? "active" : ""} onClick={() => (!reportDirty || window.confirm('Discard unsaved report changes?')) && setDashboardMode("details")}><TableProperties size={18} /><span>Weekly metric totals<small>Every imported KPI in one view</small></span></button>
        <button role="tab" aria-selected={dashboardMode === "trends"} className={dashboardMode === "trends" ? "active" : ""} onClick={() => (!reportDirty || window.confirm('Discard unsaved report changes?')) && setDashboardMode("trends")}><BarChart3 size={18}/><span>Trends<small>Compare progress over time</small></span></button>
        {['admin','supervisor'].includes(profile.role)&&<button role="tab" aria-selected={dashboardMode === "plans"} className={dashboardMode === "plans" ? "active" : ""} onClick={() => (!reportDirty || window.confirm('Discard unsaved report changes?')) && setDashboardMode("plans")}><Target size={18}/><span>Regional plans<small>Reports, actions, and follow-up</small></span></button>}

      </div>

      {dashboardMode === 'trends' ? (currentLoading ? <p>Loading trends…</p> : <KPITrends history={historyRows} stores={trendStores}/>) : dashboardMode === 'plans' ? <KPIRegionalPlans profile={profile} weekEnd={weekEnd} groups={access.supervisorGroups} onDirtyChange={setReportDirty}/> : <>
      {levelControls}
      {viewLevel === "supervisor" && access.canViewAll && (
        <section className="kpi-scope-bar"><label>Supervisor group<select disabled={profile.role === "supervisor"} value={selectedGroup?.id ?? ""} onChange={(event) => setSelectedSupervisor(event.target.value)}>{(profile.role === "supervisor" ? access.supervisorGroups.filter((group) => group.id === profile.id) : access.supervisorGroups).map((group) => <option value={group.id} key={group.id}>{group.name} · {group.stores.length} stores</option>)}</select></label><p>Showing {selectedGroup?.stores.map(storeLabel).join(", ") || "no assigned stores"}</p></section>
      )}
      {viewLevel === "store" && storeTabs.length > 0 && (
        <div className="kpi-store-tabs" role="tablist" aria-label="Store selection">{storeTabs.map((item) => <button role="tab" aria-selected={selectedStore === item.store} className={selectedStore === item.store ? "active" : ""} key={item.store} onClick={() => setSelectedStore(item.store)}>{storeLabel(item.store)}<span>{item.status}</span></button>)}</div>
      )}
      {scopedNextForecasts.length > 0 && <section className="kpi-forward-forecast"><div><span>Following-week outlook</span><strong>{formatCurrency(nextProjectedSalesTotal, 2)}</strong><small>{scopedNextForecasts.length} store{scopedNextForecasts.length === 1 ? "" : "s"} · {nextAverageConfidence.toFixed(0)}% average confidence</small></div><p>Use this early view to start staffing and sales planning before the week becomes current.</p></section>}
      {viewLevel === "supervisor" && !currentLoading && <section className="panel kpi-group-performance"><h2>{selectedGroup?.name || "Supervisor group"} performance</h2>
        {!selectedGroup?.stores.length ? <p>No stores assigned. An administrator can set this up in Team access → Supervisor store groups.</p> : <><p>{selectedGroup.stores.length} assigned stores · Results week ending {weekEnd}</p><div className="kpi-group-metrics">{rankingMetrics.map((metric) => { const value = selectedGroup.summary?.values[metric.key] ?? null; return <article key={metric.key}><span>{metric.label}</span><strong>{value === null ? "N/A" : metric.format === "percent" ? (value * 100).toFixed(2) + "%" : metric.format === "currency" ? formatCurrency(value, 2) : value.toFixed(2) + " min"}</strong><small>{metric.key === "sales" ? "Group total" : metric.key === "pcya" ? "Comparable-store sales growth" : "Store average"} · {selectedGroup.summary?.counts[metric.key] ?? 0} reporting</small></article>; })}</div></>}
      </section>}

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
              <div className="table-toolbar"><div><p className="eyebrow">Selected week</p><h2>All imported metrics by store</h2><p>Click any metric header to sort highest-to-lowest; click it again for lowest-to-highest. Click Store to reset by store number.</p></div></div>
              <div className="responsive-table kpi-sticky-table kpi-store-sticky"><table><thead><tr><th aria-sort={weeklyMetricSort.key === "store" ? "ascending" : "none"}><button className="kpi-sort-button" onClick={() => sortWeeklyMetrics("store")}>Store {sortIcon("store")}</button></th>{weeklyMetricDefinitions.map((metric) => <th key={metric.key} aria-sort={weeklyMetricSort.key === metric.key ? (weeklyMetricSort.direction === "desc" ? "descending" : "ascending") : "none"}><button className="kpi-sort-button" onClick={() => sortWeeklyMetrics(metric.key)}>{metric.label} {sortIcon(metric.key)}</button></th>)}</tr></thead><tbody>{sortedWeeklyMetrics.map((item) => <tr key={item.store}><td><button className="kpi-store-link" onClick={() => { setSelectedStore(item.store); setViewLevel("store"); }}>{storeLabel(item.store)}</button></td>{weeklyMetricDefinitions.map((metric) => <td key={metric.key}>{displayMetricValue(item.metrics, metric)}</td>)}</tr>)}</tbody></table></div>
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
            <section className="panel table-panel kpi-leaderboard kpi-monday-review">
              <div className="table-toolbar"><div><p className="eyebrow">Monday leadership review</p><h2>{viewLevel === "company" ? "Company commitments" : `${selectedGroup?.name ?? "Supervisor"} commitments`}</h2><p>Review the commitment for {formatWeekRange(addIsoDays(weekEnd, -6), weekEnd)}, compare the actual result, then open a store to set its plan for {formatWeekRange(addIsoDays(weekEnd, 1), addIsoDays(weekEnd, 7))}.</p></div></div>
              <div className="kpi-performance-legend"><span className="hit">Hit</span><span className="close">Close</span><span className="miss">Missed</span><small>Close means within $500 sales, 0.3 labor points, $1 SPLH, 0.2 food points, or 0.5 minute for Load and ADT.</small></div>
              <div className="responsive-table kpi-sticky-table kpi-ranking-sticky"><table><thead><tr><th>Rank</th><th>Store</th><th>Previous commitment</th><th>Actual result</th><th>Where we landed</th><th>New commitment</th><th>Monday action</th></tr></thead><tbody>{rankings.map((item, index) => {
                const itemScore = score(item);
                const reviewRows = commitmentReviewRows(item);
                const missed = reviewRows.filter((metric) => metric.status.toLowerCase() === "no");
                const close = reviewRows.filter((metric) => metric.status.toLowerCase() === "close");
                return <tr key={item.store}>
                  <td><span className={`rank-badge rank-${index + 1}`}>{index + 1}</span></td>
                  <td><button className="kpi-store-link" onClick={() => { setSelectedStore(item.store); setViewLevel("store"); }}>{storeLabel(item.store)}</button></td>
                  <td><div className="kpi-review-metrics">{reviewRows.map((metric) => <span key={metric.name}><small>{metric.name}</small><strong>{displayCommitmentValue(metric.name, metric.previous ?? "", "Not set")}</strong>{metric.previousSource === "automatic" && <em>Auto suggested</em>}</span>)}</div></td>
                  <td><div className="kpi-review-metrics">{reviewRows.map((metric) => <span className={`kpi-result-value ${statusClass(metric.status)}`} key={metric.name}><small>{metric.name}</small><strong>{displayCommitmentValue(metric.name, metric.actual, "Pending")}</strong></span>)}</div></td>
                  <td><strong className="kpi-review-score">{itemScore.percent === null ? "No prior commitment" : `${itemScore.hits}/${itemScore.total} met`}</strong>{missed.length > 0 && <div className="kpi-miss-list">{missed.map((metric) => <span key={metric.name}>{metric.name}</span>)}</div>}{close.length > 0 && <div className="kpi-close-list">{close.map((metric) => <span key={metric.name}>{metric.name} close</span>)}</div>}{missed.length === 0 && close.length === 0 && itemScore.total > 0 ? <span className="kpi-all-met">All measured goals met</span> : itemScore.total === 0 ? <small className="kpi-score-detail">The first comparison appears after a prior-week commitment exists.</small> : null}</td>
                  <td><div className="kpi-review-metrics">{reviewRows.map((metric) => <span key={metric.name}><small>{metric.name}</small><strong>{displayCommitmentValue(metric.name, metric.next, "Suggested")}</strong></span>)}</div></td>
                  <td><button className="button secondary kpi-plan-button" onClick={() => { setSelectedStore(item.store); setViewLevel("store"); }}>Review &amp; set plan</button></td>
                </tr>;
              })}</tbody></table></div>
            </section>
          ) : selected && (
            <div className="kpi-layout">
              <section className="panel table-panel kpi-results"><div className="table-toolbar"><div><p className="eyebrow">{storeLabel(selected.store)}</p><h2>Monday performance plan</h2><p>Close the loop on {formatWeekRange(addIsoDays(weekEnd, -6), weekEnd)}, then set the commitment for {formatWeekRange(addIsoDays(weekEnd, 1), addIsoDays(weekEnd, 7))}.</p>{selected.uses_automatic_previous_goals && <span className="kpi-auto-commitment">Automatic comparisons are saved. Older gaps use estimates from earlier results.</span>}</div><span className={`kpi-overall ${selected.overall_status.toLowerCase().replaceAll(" ", "-")}`}>{selected.overall_status}</span></div><div className="kpi-performance-legend"><span className="hit">Hit</span><span className="close">Close</span><span className="miss">Missed</span></div><div className="responsive-table kpi-sticky-table kpi-metric-sticky"><table><thead><tr><th>Metric</th><th>Previous commitment</th><th>Actual result</th><th>Result</th><th>Trajectory</th><th>Suggested</th><th>New commitment</th></tr></thead><tbody>{metrics.map(({ name, trajectory, suggested, finalGoal, previousGoal, previousSource, actual, status, overridden }) => <tr className={`kpi-performance-row ${statusClass(status)}`} key={name}><td><strong>{name}</strong></td><td>{displayCommitmentValue(name, previousGoal ?? "", "Not set")}{previousSource === "automatic" && <small className="kpi-auto-goal-note">Auto suggested</small>}</td><td><strong>{displayCommitmentValue(name, actual, "Pending")}</strong></td><td><span className={`kpi-status ${statusClass(status)}`}>{status || "Pending"}</span></td><td>{displayCommitmentValue(name, trajectory, "—")}</td><td>{displayCommitmentValue(name, suggested, "—")}</td><td><strong>{displayCommitmentValue(name, finalGoal, "—")}</strong><small className={`kpi-goal-source ${overridden ? "supervisor" : "suggested"}`}>{overridden ? "Supervisor override" : "Suggested default"}</small></td></tr>)}</tbody></table></div></section>
              <form className="panel kpi-editor" onSubmit={save}>
                <div className="panel-heading"><div><p className="eyebrow">Supervisor commitment</p><h2>Set the weekly plan</h2><p>Applies to {formatWeekRange(addIsoDays(weekEnd,1),addIsoDays(weekEnd,7))}. Past results stay locked.</p></div><Target size={23} /></div>
                <div className="kpi-goal-grid">
                  <label>Sales goal<div className="kpi-input-affix prefix"><span>$</span><input type="number" step="1" value={draft.supervisor_sales_goal} placeholder={selected.sales.recommended_goal} disabled={!canEditSelected} onChange={(event) => setDraft({ ...draft, supervisor_sales_goal: event.target.value })} /></div><small>Blank uses the suggested goal.</small></label>
                  <label>Labor goal<div className="kpi-input-affix suffix"><input type="number" step="0.1" value={draft.supervisor_labor_goal} placeholder={formatPercent(numericValue(selected.labor.suggested_goal)).replace("%", "")} disabled={!canEditSelected} onChange={(event) => setDraft({ ...draft, supervisor_labor_goal: event.target.value })} /><span>%</span></div><small>Blank uses the suggested goal.</small></label>
                  <label>SPLH goal<div className="kpi-input-affix prefix"><span>$</span><input type="number" step="0.01" value={draft.supervisor_splh_goal} placeholder={selected.splh.suggested_goal} disabled={!canEditSelected} onChange={(event) => setDraft({ ...draft, supervisor_splh_goal: event.target.value })} /></div><small>Blank uses the suggested goal.</small></label>
                  <label>Food variance goal<div className="kpi-input-affix suffix"><input type="number" step="0.1" value={draft.supervisor_food_variance_goal} placeholder={formatPercent(numericValue(selected.food_variance.suggested_goal)).replace("%", "")} disabled={!canEditSelected} onChange={(event) => setDraft({ ...draft, supervisor_food_variance_goal: event.target.value })} /><span>%</span></div><small>Blank uses the suggested goal.</small></label>
                  <label>Load goal<input type="number" step="0.1" value={draft.supervisor_load_goal} placeholder={selected.load.suggested_goal} disabled={!canEditSelected} onChange={(event) => setDraft({ ...draft, supervisor_load_goal: event.target.value })} /><small>Blank uses the suggested goal.</small></label>
                  <label>ADT goal<input type="number" step="0.1" value={draft.supervisor_adt_goal} placeholder={selected.adt.suggested_goal} disabled={!canEditSelected} onChange={(event) => setDraft({ ...draft, supervisor_adt_goal: event.target.value })} /><small>Blank uses the suggested goal.</small></label>
                </div>
                <label>Focus area<select value={draft.focus_area} disabled={!canEditSelected} onChange={(event) => setDraft({ ...draft, focus_area: event.target.value })}><option value="">Select a focus</option>{focusAreas.map((area) => <option key={area}>{area}</option>)}</select></label>
                <label>Owner<input value={draft.owner} disabled={!canEditSelected} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} placeholder="Person accountable for the plan" /></label>
                <label>Action plan<textarea rows={5} value={draft.action_plan} disabled={!canEditSelected} onChange={(event) => setDraft({ ...draft, action_plan: event.target.value })} placeholder="What will the store do differently this week?" /></label>
                {canEditSelected ? <button className="button primary full" disabled={saving}><Save size={17} />{saving ? "Saving commitment…" : "Save commitment"}</button> : <p className="security-note">Completed weeks are read-only. Select the latest completed results week to set current-week goals; only admins and the assigned supervisor may edit.</p>}
              </form>
            </div>
          )}
        </>
      )}
      {!currentLoading && companyRankings.length > 0 && <section className="panel kpi-company-ranks">
        <div className="table-toolbar"><div><p className="eyebrow">Company comparison · {companyStoreCount} active stores</p><h2>Six KPI rankings</h2><p>Sales has two independent ranks: weekly dollars and PCYA growth. #1 is best. Ties share a rank; N/A is excluded from that metric.</p></div></div>
        <div className="responsive-table kpi-sticky-table kpi-store-sticky"><table><thead><tr><th>Store</th>{rankingMetrics.map((metric) => <th key={metric.key}>{metric.label}<small className="kpi-score-detail">{metric.lower ? "Lower is better" : "Higher is better"}</small></th>)}</tr></thead><tbody>
          {companyRankings.filter((row) => viewLevel === "company" || (viewLevel === "store" ? row.store === selectedStore : selectedGroup?.stores.includes(row.store))).map((row) => <tr key={row.store_id}><th scope="row">{row.name}<small className="kpi-score-detail">{row.store}</small></th>{rankingMetrics.map((metric) => { const entry = row.metrics[metric.key]; return <td key={metric.key}><strong>{entry.rank === null ? "N/A" : (entry.tied ? "T" : "") + entry.rank + " of " + entry.eligible}</strong><small className="kpi-score-detail">{entry.value === null ? metric.key === "pcya" ? "No comparable prior-year sales" : "No result" : metric.format === "percent" ? (entry.value * 100).toFixed(2) + "%" : metric.format === "currency" ? formatCurrency(entry.value, 2) : entry.value.toFixed(2) + " min"}</small></td>; })}</tr>)}
        </tbody></table></div>
        <p className="security-note">Ranks use the selected week's actual results across the company, regardless of this view's filter. PCYA compares only stores with positive prior-year sales. Food variance uses the reported signed variance.</p>
      </section>}
      </>}
    </div>
  );
}
