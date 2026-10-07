import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type MetricName = "sales" | "oven" | "deliveries";
type ForecastRequest = {
  action?: "generate" | "get";
  store_id?: string;
  week_start?: string;
  weekly_sales_target?: number | null;
};
type BaselineSet = { id: string; weeks_count: number; period_end: string };
type BaselineInterval = {
  baseline_set_id: string;
  day_of_week: number;
  interval_start: string;
  avg_sales: number;
  avg_oven_items: number;
  avg_deliveries: number;
};
type RecentInterval = {
  business_date: string;
  interval_start: string;
  royalty_sales: number;
  oven_items: number;
  delivery_orders: number;
  sales_source_batch_id: string | null;
  oven_source_batch_id: string | null;
  delivery_source_batch_id: string | null;
};
type SchedulingEvent = {
  id: string;
  name: string;
  category: string;
  start_date: string;
  end_date: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  impact_mode: "learning" | "manual";
  sales_lift_percent: number | null;
  order_count_lift_percent: number | null;
  oven_items_lift_percent: number | null;
  delivery_lift_percent: number | null;
};
type IntervalProjection = {
  business_date: string;
  day_of_week: number;
  interval_start: string;
  projected_sales: number;
  projected_orders: number;
  projected_oven_items: number;
  projected_deliveries: number;
  required_managers: number;
  required_insiders: number;
  required_drivers: number;
};
type ForecastSettings = Record<string, unknown>;
type SuggestedShift = {
  week_plan_id: string;
  day_of_week: number;
  role: "manager" | "insider" | "driver";
  start_time: string;
  end_time: string;
  assigned_member_id: null;
  source: "suggested";
  notes: string;
};

const round = (value: number, decimals = 2) => {
  const scale = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * scale) / scale;
};
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const daysBetween = (start: string, end: string) => Math.round((new Date(`${end}T12:00:00Z`).getTime() - new Date(`${start}T12:00:00Z`).getTime()) / 86_400_000);
const mondayIndex = (iso: string) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
const isCentralDaylight = (iso: string) => {
  const label = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", timeZoneName: "short" }).format(new Date(`${iso}T18:00:00Z`));
  return label.includes("CDT");
};
const keyFor = (day: number, interval: string) => `${day}|${interval.slice(0, 5)}`;
const timeMinutes = (value: string) => {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
};
const isWithinBusinessHours = (interval: string, open: string, close: string) => {
  const value = timeMinutes(interval);
  const start = timeMinutes(open);
  const end = timeMinutes(close);
  return end <= start ? value >= start || value < end : value >= start && value < end;
};
const metricValue = (row: BaselineInterval | RecentInterval, metric: MetricName) => {
  if (metric === "sales") return Number("avg_sales" in row ? row.avg_sales : row.royalty_sales) || 0;
  if (metric === "oven") return Number("avg_oven_items" in row ? row.avg_oven_items : row.oven_items) || 0;
  return Number("avg_deliveries" in row ? row.avg_deliveries : row.delivery_orders) || 0;
};
const eventIncludesInterval = (event: SchedulingEvent, date: string, interval: string) => {
  if (date < event.start_date || date > event.end_date) return false;
  if (event.all_day || !event.start_time || !event.end_time) return true;
  return isWithinBusinessHours(interval, event.start_time, event.end_time);
};
const coefficientOfVariation = (values: number[]) => {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (!mean) return null;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance) / mean;
};
const confidenceLevel = (score: number) => score >= 80 ? "high" : score >= 60 ? "moderate" : "low";
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const weightedAverage = (components: Array<{ value: number; weight: number }>) => {
  const usable = components.filter((component) => component.value > 0 && component.weight > 0);
  const weight = usable.reduce((sum, component) => sum + component.weight, 0);
  return weight ? usable.reduce((sum, component) => sum + component.value * component.weight, 0) / weight : 0;
};
const clockTime = (minutes: number) => {
  const normalized = ((Math.round(minutes / 15) * 15) % 1440 + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}:00`;
};
const businessMinute = (time: string, openMinute: number) => {
  const minute = timeMinutes(time);
  return minute < openMinute ? minute + 1440 : minute;
};

function buildCoverageShifts(
  planId: string,
  day: number,
  role: "manager" | "insider" | "driver",
  points: Array<{ minute: number; need: number }>,
  windowStart: number,
  windowEnd: number,
  minimum: number,
  maximum: number,
  note: string,
): SuggestedShift[] {
  type Draft = { start: number; end?: number };
  const active: Draft[] = [];
  const finished: Draft[] = [];
  for (const point of points) {
    for (let index = active.length - 1; index >= 0; index -= 1) {
      if (point.minute - active[index].start >= maximum) finished.push({ ...active.splice(index, 1)[0], end: point.minute });
    }
    while (active.length > point.need) {
      const eligible = active
        .map((shift, index) => ({ shift, index }))
        .filter(({ shift }) => point.minute - shift.start >= minimum)
        .sort((left, right) => left.shift.start - right.shift.start)[0];
      if (!eligible) break;
      finished.push({ ...active.splice(eligible.index, 1)[0], end: point.minute });
    }
    while (active.length < point.need) {
      const latestStart = Math.max(windowStart, windowEnd - minimum);
      active.push({ start: Math.min(point.minute, latestStart) });
    }
  }
  for (const shift of active) finished.push({ ...shift, end: Math.min(windowEnd, shift.start + maximum) });
  return finished
    .map((shift) => ({ ...shift, end: Math.max(shift.end ?? windowEnd, shift.start + minimum) }))
    .filter((shift) => shift.end > shift.start)
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .map((shift) => ({
      week_plan_id: planId,
      day_of_week: day,
      role,
      start_time: clockTime(shift.start),
      end_time: clockTime(shift.end),
      assigned_member_id: null,
      source: "suggested",
      notes: note,
    }));
}

function buildManagerShifts(planId: string, day: number, openMinute: number, closeMinute: number, settings: ForecastSettings): SuggestedShift[] {
  const start = openMinute - (Number(settings.manager_preopen_minutes) || 60);
  const end = closeMinute + (Number(settings.manager_postclose_minutes) || 60);
  const crossover = clamp(Number(settings.manager_crossover_minutes) || 60, 15, 120);
  const minimum = Math.max(180, (Number(settings.minimum_shift_hours) || 3) * 60);
  const maximum = Math.max(minimum, (Number(settings.max_shift_hours) || 9) * 60);
  const combinedMinutes = end - start + crossover;
  let openingLength = clamp(Math.ceil(combinedMinutes / 30) * 15, minimum, maximum);
  let closingLength = combinedMinutes - openingLength;
  if (closingLength > maximum) { closingLength = maximum; openingLength = combinedMinutes - closingLength; }
  if (closingLength < minimum) { closingLength = minimum; openingLength = combinedMinutes - closingLength; }

  if (openingLength <= maximum && closingLength <= maximum) {
    const openingEnd = start + openingLength;
    return [
      { week_plan_id: planId, day_of_week: day, role: "manager", start_time: clockTime(start), end_time: clockTime(openingEnd), assigned_member_id: null, source: "suggested", notes: "Opening manager" },
      { week_plan_id: planId, day_of_week: day, role: "manager", start_time: clockTime(openingEnd - crossover), end_time: clockTime(end), assigned_member_id: null, source: "suggested", notes: `${crossover}-minute manager crossover` },
    ];
  }

  const points = Array.from({ length: Math.ceil((end - start) / 15) }, (_, index) => ({ minute: start + index * 15, need: 1 }));
  return buildCoverageShifts(planId, day, "manager", points, start, end, minimum, maximum, "Required management coverage");
}

function buildSuggestedShifts(planId: string, intervals: IntervalProjection[], hours: Map<number, { open: string; close: string }>, settings: ForecastSettings) {
  const minimum = Math.max(180, (Number(settings.minimum_shift_hours) || 3) * 60);
  const maximum = Math.max(minimum, (Number(settings.max_shift_hours) || 9) * 60);
  const shifts: SuggestedShift[] = [];
  for (let day = 0; day < 7; day += 1) {
    const storeHours = hours.get(day);
    if (!storeHours) continue;
    const openMinute = timeMinutes(storeHours.open);
    let closeMinute = businessMinute(storeHours.close, openMinute);
    if (closeMinute === openMinute) closeMinute += 1440;
    shifts.push(...buildManagerShifts(planId, day, openMinute, closeMinute, settings));

    const rows = intervals.filter((row) => row.day_of_week === day && isWithinBusinessHours(row.interval_start, storeHours.open, storeHours.close));
    for (const role of ["insider", "driver"] as const) {
      let points = rows.map((row) => ({ minute: businessMinute(row.interval_start, openMinute), need: role === "insider" ? row.required_insiders : row.required_drivers }));
      const windowStart = role === "driver" ? openMinute - (Number(settings.driver_preopen_minutes) || 0) : openMinute;
      let windowEnd = closeMinute;
      if (role === "driver" && settings.late_driver_rule === "hour_before_close") {
        windowEnd = closeMinute - 60;
        points = points.filter((point) => point.minute < windowEnd);
      }
      if (role === "driver" && settings.late_driver_rule === "second_closer") {
        windowEnd += Number(settings.driver_postclose_minutes) || 60;
        for (let minute = closeMinute - 60; minute < windowEnd; minute += 15) {
          const existing = points.find((point) => point.minute === minute);
          if (existing) existing.need = Math.max(existing.need, 2);
          else points.push({ minute, need: 2 });
        }
        points.sort((left, right) => left.minute - right.minute);
      }
      const roleMaximum = role === "driver" && !settings.opening_driver_through_rush ? Math.min(maximum, 360) : maximum;
      const roleShifts = buildCoverageShifts(planId, day, role, points, windowStart, windowEnd, minimum, roleMaximum, role === "insider" ? "Oven demand coverage · rounded down" : "Delivery demand coverage");
      if (role === "driver" && settings.late_driver_rule === "second_closer") roleShifts.forEach((shift) => { if (shift.end_time === clockTime(windowEnd)) shift.notes = "Second closing driver coverage"; });
      shifts.push(...roleShifts);
    }
  }
  return shifts;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const headers = { ...corsHeaders, "Content-Type": "application/json" };
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405, headers });

  try {
    const authHeader = request.headers.get("Authorization") ?? "";
    if (!authHeader) throw new HttpError(401, "Sign in is required.");
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new HttpError(401, "Your sign-in session is no longer valid.");
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile, error: profileError } = await admin.from("profiles").select("id,role,active,store_id").eq("id", user.id).maybeSingle();
    if (profileError || !profile?.active) throw new HttpError(403, "Forecast access is not active for this account.");
    if (!["manager", "supervisor", "admin"].includes(profile.role)) throw new HttpError(403, "Forecasts require manager, supervisor, or administrator access.");

    const body = await request.json() as ForecastRequest;
    const action = body.action ?? "generate";
    if (!body.store_id) throw new HttpError(400, "A store is required.");
    if (!body.week_start || !/^\d{4}-\d{2}-\d{2}$/.test(body.week_start)) throw new HttpError(400, "A valid Monday week_start is required.");
    if (mondayIndex(body.week_start) !== 0) throw new HttpError(400, "Forecast weeks must begin on Monday.");
    await requireStoreAccess(admin, user.id, profile, body.store_id);

    if (action === "get") {
      const result = await loadForecast(admin, body.store_id, body.week_start);
      return new Response(JSON.stringify({ ok: true, result }), { headers });
    }
    if (action !== "generate") throw new HttpError(400, "A valid forecast action is required.");
    const result = await generateForecast(admin, user.id, body.store_id, body.week_start, body.weekly_sales_target ?? null);
    return new Response(JSON.stringify({ ok: true, result }), { headers });
  } catch (error) {
    console.error(error);
    const status = error instanceof HttpError ? error.status : 400;
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), { status, headers });
  }
});

async function requireStoreAccess(admin: ReturnType<typeof createClient>, userId: string, profile: { role: string; store_id: string | null }, storeId: string) {
  if (profile.role === "admin") return;
  if (profile.store_id === storeId) return;
  const { data, error } = await admin.from("profile_store_assignments").select("store_id").eq("profile_id", userId).eq("store_id", storeId).maybeSingle();
  if (error || !data) throw new HttpError(403, "This store is not assigned to your account.");
}

async function loadForecast(admin: ReturnType<typeof createClient>, storeId: string, weekStart: string) {
  const { data: run, error } = await admin.from("demand_forecast_runs").select("*").eq("store_id", storeId).eq("week_start", weekStart).eq("is_current", true).maybeSingle();
  if (error) throw error;
  if (!run) return null;
  const [{ data: daily, error: dailyError }, { data: intervals, error: intervalError }] = await Promise.all([
    admin.from("demand_forecast_daily").select("*").eq("forecast_run_id", run.id).order("day_of_week"),
    admin.from("demand_forecast_intervals").select("*").eq("forecast_run_id", run.id).order("day_of_week").order("interval_start"),
  ]);
  if (dailyError || intervalError) throw dailyError ?? intervalError;
  return { run, daily: daily ?? [], intervals: intervals ?? [] };
}

async function generateForecast(admin: ReturnType<typeof createClient>, userId: string, storeId: string, weekStart: string, manualWeeklySales: number | null) {
  const weekEnd = addDays(weekStart, 6);
  const season = isCentralDaylight(addDays(weekStart, 3)) ? "daylight" : "non_daylight";
  const historyStart = addDays(weekStart, -84);
  const kpiHistoryStart = addDays(weekStart, -420);

  const [setsResult, recentResult, kpiResult, eventsResult, settingsResult, hoursResult, storeResult] = await Promise.all([
    admin.from("labor_baseline_sets").select("id,weeks_count,period_end").eq("store_id", storeId).eq("season", season).eq("active", true).order("period_end", { ascending: false }),
    admin.from("labor_metric_intervals").select("business_date,interval_start,royalty_sales,oven_items,delivery_orders,sales_source_batch_id,oven_source_batch_id,delivery_source_batch_id").eq("store_id", storeId).gte("business_date", historyStart).lt("business_date", weekStart),
    admin.from("kpi_weekly_results").select("week_end,metrics").eq("store_id", storeId).gte("week_end", kpiHistoryStart).lt("week_end", weekStart).order("week_end", { ascending: false }),
    admin.from("labor_scheduling_events").select("id,name,category,start_date,end_date,all_day,start_time,end_time,impact_mode,sales_lift_percent,order_count_lift_percent,oven_items_lift_percent,delivery_lift_percent").eq("status", "active").lte("start_date", weekEnd).gte("end_date", weekStart).or(`scope.eq.company,store_id.eq.${storeId}`),
    admin.from("labor_store_settings").select("*").eq("store_id", storeId).maybeSingle(),
    admin.from("labor_store_hours").select("day_of_week,open_time,close_time").eq("store_id", storeId),
    admin.from("stores").select("id,name,store_number").eq("id", storeId).single(),
  ]);
  const firstError = setsResult.error || recentResult.error || kpiResult.error || eventsResult.error || settingsResult.error || hoursResult.error || storeResult.error;
  if (firstError) throw firstError;

  const baselineSets = (setsResult.data ?? []) as BaselineSet[];
  if (!baselineSets.length) throw new HttpError(422, `No active ${season.replace("_", "-")} baseline is available for this store.`);
  const setIds = baselineSets.map((set) => set.id);
  const { data: baselineData, error: baselineError } = await admin.from("labor_baseline_intervals").select("baseline_set_id,day_of_week,interval_start,avg_sales,avg_oven_items,avg_deliveries").in("baseline_set_id", setIds);
  if (baselineError) throw baselineError;
  const baselineRows = (baselineData ?? []) as BaselineInterval[];
  if (!baselineRows.length) throw new HttpError(422, "The active seasonal baseline does not contain interval data.");

  const setWeeks = new Map(baselineSets.map((set) => [set.id, Number(set.weeks_count) || 1]));
  const baseline = new Map<string, { sales: number; oven: number; deliveries: number; weight: number }>();
  for (const row of baselineRows) {
    const key = keyFor(Number(row.day_of_week), row.interval_start);
    const current = baseline.get(key) ?? { sales: 0, oven: 0, deliveries: 0, weight: 0 };
    const weight = setWeeks.get(row.baseline_set_id) ?? 1;
    current.sales += Number(row.avg_sales || 0) * weight;
    current.oven += Number(row.avg_oven_items || 0) * weight;
    current.deliveries += Number(row.avg_deliveries || 0) * weight;
    current.weight += weight;
    baseline.set(key, current);
  }
  for (const value of baseline.values()) {
    value.sales /= value.weight || 1;
    value.oven /= value.weight || 1;
    value.deliveries /= value.weight || 1;
  }

  const recentRows = (recentResult.data ?? []) as RecentInterval[];
  const recent = new Map<string, { sales: number; salesWeight: number; oven: number; ovenWeight: number; deliveries: number; deliveryWeight: number }>();
  const recentWeekKeys = new Set<string>();
  for (const row of recentRows) {
    if (isCentralDaylight(row.business_date) !== (season === "daylight")) continue;
    const ageWeeks = Math.max(0, daysBetween(row.business_date, weekStart) / 7);
    if (ageWeeks > 4.5) continue;
    const weight = 1;
    const key = keyFor(mondayIndex(row.business_date), row.interval_start);
    const current = recent.get(key) ?? { sales: 0, salesWeight: 0, oven: 0, ovenWeight: 0, deliveries: 0, deliveryWeight: 0 };
    if (row.sales_source_batch_id) { current.sales += Number(row.royalty_sales || 0) * weight; current.salesWeight += weight; }
    if (row.oven_source_batch_id) { current.oven += Number(row.oven_items || 0) * weight; current.ovenWeight += weight; }
    if (row.delivery_source_batch_id) { current.deliveries += Number(row.delivery_orders || 0) * weight; current.deliveryWeight += weight; }
    recent.set(key, current);
    recentWeekKeys.add(addDays(row.business_date, -mondayIndex(row.business_date)));
  }

  const kpiRows = (kpiResult.data ?? []).map((row) => ({
    week_end: String(row.week_end),
    sales: Number((row.metrics as Record<string, unknown>)?.royalty_sales) || 0,
    orders: Number((row.metrics as Record<string, unknown>)?.order_count) || 0,
  })).filter((row) => row.sales > 0);
  const weightedKpi = (metric: "orders") => {
    let total = 0; let weightTotal = 0;
    for (const row of kpiRows) {
      const value = row[metric];
      if (!value) continue;
      const age = Math.max(0, daysBetween(row.week_end, weekEnd) / 7);
      const weight = 0.82 ** age;
      total += value * weight; weightTotal += weight;
    }
    return weightTotal ? total / weightTotal : 0;
  };
  const recentFourSales = average(kpiRows.slice(0, 4).map((row) => row.sales));
  const thirteenWeekSales = average(kpiRows.slice(0, 13).map((row) => row.sales));
  const priorFourSales = average(kpiRows.slice(4, 8).map((row) => row.sales));
  const lastYearTarget = addDays(weekEnd, -364);
  const lastYearMatch = kpiRows
    .map((row) => ({ ...row, distance: Math.abs(daysBetween(row.week_end, lastYearTarget)) }))
    .filter((row) => row.distance <= 10)
    .sort((left, right) => left.distance - right.distance)[0];
  const momentum = priorFourSales > 0 ? clamp(((recentFourSales / priorFourSales) - 1) * 0.25, -0.10, 0.10) : 0;

  const intervalKeys = Array.from(baseline.keys()).sort((left, right) => {
    const [leftDay, leftTime] = left.split("|"); const [rightDay, rightTime] = right.split("|");
    return Number(leftDay) - Number(rightDay) || leftTime.localeCompare(rightTime);
  });
  const events = (eventsResult.data ?? []) as SchedulingEvent[];
  const eventAdjustments = events.map((event) => ({
    id: event.id, name: event.name, category: event.category, mode: event.impact_mode,
    dates: `${event.start_date}:${event.end_date}`,
    sales_lift_percent: event.sales_lift_percent,
    order_count_lift_percent: event.order_count_lift_percent,
    oven_items_lift_percent: event.oven_items_lift_percent,
    delivery_lift_percent: event.delivery_lift_percent,
  }));

  const rawIntervals: IntervalProjection[] = intervalKeys.map((key) => {
    const [dayText, interval] = key.split("|");
    const day = Number(dayText);
    const date = addDays(weekStart, day);
    const base = baseline.get(key)!;
    const fresh = recent.get(key);
    const blend = (metric: MetricName) => {
      const baselineValue = base[metric];
      if (!fresh) return baselineValue;
      const weight = metric === "sales" ? fresh.salesWeight : metric === "oven" ? fresh.ovenWeight : fresh.deliveryWeight;
      const total = metric === "sales" ? fresh.sales : metric === "oven" ? fresh.oven : fresh.deliveries;
      if (!weight) return baselineValue;
      const recentValue = total / weight;
      return baselineValue * 0.50 + recentValue * 0.50;
    };
    let sales = blend("sales");
    let oven = blend("oven");
    let deliveries = blend("deliveries");
    for (const event of events) {
      if (event.impact_mode !== "manual" || !eventIncludesInterval(event, date, interval)) continue;
      sales *= 1 + Number(event.sales_lift_percent || 0) / 100;
      oven *= 1 + Number(event.oven_items_lift_percent || 0) / 100;
      deliveries *= 1 + Number(event.delivery_lift_percent || 0) / 100;
    }
    return {
      business_date: date, day_of_week: day, interval_start: `${interval}:00`,
      projected_sales: Math.max(0, sales), projected_orders: 0,
      projected_oven_items: Math.max(0, oven), projected_deliveries: Math.max(0, deliveries),
      required_managers: 0, required_insiders: 0, required_drivers: 0,
    };
  });

  const modeledSales = rawIntervals.reduce((sum, row) => sum + row.projected_sales, 0);
  const componentSales = weightedAverage([
    { value: recentFourSales, weight: 0.50 },
    { value: thirteenWeekSales || modeledSales, weight: 0.25 },
    { value: lastYearMatch?.sales || 0, weight: 0.25 },
  ]);
  const recommendedSales = manualWeeklySales && manualWeeklySales > 0
    ? Number(manualWeeklySales)
    : componentSales > 0 ? componentSales * (1 + momentum) : modeledSales;
  const salesScale = modeledSales > 0 ? recommendedSales / modeledSales : 1;
  rawIntervals.forEach((row) => { row.projected_sales *= salesScale; });

  const weeklyOrders = weightedKpi("orders");
  const orderBase = weeklyOrders > 0 ? weeklyOrders : recommendedSales / 23;
  const salesTotal = rawIntervals.reduce((sum, row) => sum + row.projected_sales, 0) || 1;
  for (const row of rawIntervals) {
    row.projected_orders = orderBase * (row.projected_sales / salesTotal);
    for (const event of events) {
      if (event.impact_mode === "manual" && eventIncludesInterval(event, row.business_date, row.interval_start)) {
        row.projected_orders *= 1 + Number(event.order_count_lift_percent || 0) / 100;
      }
    }
  }

  const settings = settingsResult.data ?? {};
  const hours = new Map<number, { open: string; close: string }>(
    (hoursResult.data ?? []).map((row) => [Number(row.day_of_week), { open: String(row.open_time), close: String(row.close_time) }]),
  );
  for (const row of rawIntervals) {
    const storeHours = hours.get(row.day_of_week);
    const open = Boolean(storeHours && isWithinBusinessHours(row.interval_start, storeHours.open, storeHours.close));
    if (!open) continue;
    const weekend = row.day_of_week === 4 || row.day_of_week === 5;
    const managerCapacity = Number(weekend ? settings.weekend_manager_items_per_15 : settings.manager_items_per_15) || 1;
    const insiderCapacity = Number(weekend ? settings.weekend_insider_items_per_15 : settings.insider_items_per_15) || 1;
    row.required_managers = 1;
    row.required_insiders = Math.max(0, Math.floor((row.projected_oven_items - managerCapacity) / insiderCapacity));
    row.required_drivers = Math.max(1, Math.ceil(row.projected_deliveries * (Number(settings.average_run_time_minutes) || 15) / 15));
  }

  const baselineWeeks = baselineSets.reduce((sum, set) => sum + Number(set.weeks_count || 0), 0);
  const metricCoverage = (["sales", "oven", "deliveries"] as MetricName[]).filter((metric) => baselineRows.some((row) => metricValue(row, metric) > 0)).length;
  const salesHistory = kpiRows.slice(0, 13).map((row) => row.sales);
  const volatility = coefficientOfVariation(salesHistory);
  const newestWeek = kpiRows[0]?.week_end;
  const freshnessDays = newestWeek ? Math.max(0, daysBetween(newestWeek, weekEnd)) : 999;
  let score = 0;
  score += Math.min(30, baselineWeeks * 2.5);
  score += metricCoverage * 5;
  score += Math.min(15, kpiRows.length * 2.5);
  score += Math.min(15, recentWeekKeys.size * 3);
  score += volatility === null ? 5 : 15 * (1 - clamp(volatility / 0.3, 0, 1));
  score += freshnessDays <= 14 ? 10 : freshnessDays <= 28 ? 6 : freshnessDays <= 56 ? 3 : 0;
  const learningEvents = events.filter((event) => event.impact_mode === "learning").length;
  score -= Math.min(15, learningEvents * 5);
  score = round(clamp(score, 0, 100), 1);
  const reasons = [
    `${baselineWeeks} comparable ${season.replace("_", "-")} baseline weeks`,
    `${metricCoverage} of 3 interval demand metrics available`,
    `${kpiRows.length} recent KPI weeks used for trend`,
    `${recentWeekKeys.size} recent interval weeks used`,
    volatility === null ? "Not enough weekly history to measure volatility" : `Weekly sales variability is ${round(volatility * 100, 1)}%`,
    newestWeek ? `Latest KPI actual ends ${newestWeek}` : "No recent KPI actuals are available",
    `Sales blend uses 50% recent 4-week, 25% 13-week, and ${lastYearMatch ? "25% same week last year" : "normalized available history"}`,
    `Momentum adjustment is ${momentum >= 0 ? "+" : ""}${round(momentum * 100, 1)}% after the 25% factor and ±10% cap`,
    events.length ? `${events.length} event adjustment${events.length === 1 ? "" : "s"} reviewed` : "No special events overlap this week",
  ];
  if (learningEvents) reasons.push(`${learningEvents} event${learningEvents === 1 ? " has" : "s have"} no learned lift yet`);
  if (manualWeeklySales) reasons.push("Manager-entered weekly sales target anchored the sales forecast");

  const uncertainty = clamp(0.05 + (100 - score) * 0.0025, 0.05, 0.3);
  const daily = Array.from({ length: 7 }, (_, day) => {
    const rows = rawIntervals.filter((row) => row.day_of_week === day);
    const projectedSales = rows.reduce((sum, row) => sum + row.projected_sales, 0);
    const applied = events.filter((event) => event.start_date <= addDays(weekStart, day) && event.end_date >= addDays(weekStart, day)).map((event) => ({ id: event.id, name: event.name, mode: event.impact_mode }));
    return {
      store_id: storeId, business_date: addDays(weekStart, day), day_of_week: day,
      projected_sales: round(projectedSales),
      projected_orders: round(rows.reduce((sum, row) => sum + row.projected_orders, 0)),
      projected_oven_items: round(rows.reduce((sum, row) => sum + row.projected_oven_items, 0)),
      projected_deliveries: round(rows.reduce((sum, row) => sum + row.projected_deliveries, 0)),
      low_sales: round(projectedSales * (1 - uncertainty)), high_sales: round(projectedSales * (1 + uncertainty)),
      applied_adjustments: applied,
    };
  });
  const weekly = {
    projected_sales: round(daily.reduce((sum, row) => sum + row.projected_sales, 0)),
    projected_orders: round(daily.reduce((sum, row) => sum + row.projected_orders, 0)),
    projected_oven_items: round(daily.reduce((sum, row) => sum + row.projected_oven_items, 0)),
    projected_deliveries: round(daily.reduce((sum, row) => sum + row.projected_deliveries, 0)),
    low_sales: round(daily.reduce((sum, row) => sum + row.low_sales, 0)),
    high_sales: round(daily.reduce((sum, row) => sum + row.high_sales, 0)),
  };

  await admin.from("demand_forecast_runs").update({ is_current: false, status: "superseded", updated_at: new Date().toISOString() }).eq("store_id", storeId).eq("week_start", weekStart).eq("is_current", true);
  const { data: run, error: runError } = await admin.from("demand_forecast_runs").insert({
    store_id: storeId, week_start: weekStart, week_end: weekEnd, season, method_version: "demand-v2",
    confidence_score: score, confidence_level: confidenceLevel(score), confidence_reasons: reasons,
    input_summary: {
      baseline_sets: baselineSets.length, baseline_weeks: baselineWeeks, recent_kpi_weeks: kpiRows.length,
      recent_interval_weeks: recentWeekKeys.size, volatility, store: storeResult.data,
      sales_components: {
        recent_four_week: round(recentFourSales), thirteen_week: round(thirteenWeekSales),
        same_week_last_year: round(lastYearMatch?.sales || 0), momentum_percent: round(momentum * 100, 2),
      },
    },
    event_adjustments: eventAdjustments, weekly_projection: weekly, manual_weekly_sales: manualWeeklySales, generated_by: userId,
  }).select("*").single();
  if (runError || !run) throw runError ?? new Error("The forecast run could not be saved.");

  const dailyRows = daily.map((row) => ({ ...row, forecast_run_id: run.id }));
  const intervalRows = rawIntervals.map((row) => ({
    ...row, forecast_run_id: run.id, store_id: storeId,
    projected_sales: round(row.projected_sales), projected_orders: round(row.projected_orders),
    projected_oven_items: round(row.projected_oven_items), projected_deliveries: round(row.projected_deliveries),
  }));
  const [{ error: dailyError }, { error: intervalError }] = await Promise.all([
    admin.from("demand_forecast_daily").insert(dailyRows),
    admin.from("demand_forecast_intervals").insert(intervalRows),
  ]);
  if (dailyError || intervalError) throw dailyError ?? intervalError;

  const { data: existingPlan } = await admin.from("labor_week_plans").select("id,status").eq("store_id", storeId).eq("week_start", weekStart).maybeSingle();
  let planId: string | null = existingPlan?.id ?? null;
  let editedPlanPreserved = false;
  if (!existingPlan || existingPlan.status !== "published") {
    const { data: plan, error: planError } = await admin.from("labor_week_plans").upsert({
      store_id: storeId, week_start: weekStart, status: existingPlan?.status ?? "draft", forecast_method: "demand-v2", forecast_run_id: run.id,
      created_by: userId, updated_at: new Date().toISOString(),
    }, { onConflict: "store_id,week_start" }).select("id").single();
    if (planError || !plan) throw planError ?? new Error("The labor week plan could not be prepared.");
    planId = plan.id;
    const planDaily = daily.map((row) => ({ week_plan_id: plan.id, day_of_week: row.day_of_week, projected_sales: row.projected_sales, projected_oven_items: Math.round(row.projected_oven_items), projected_deliveries: Math.round(row.projected_deliveries) }));
    const planIntervals = intervalRows.map((row) => ({
      week_plan_id: plan.id, day_of_week: row.day_of_week, interval_start: row.interval_start,
      projected_sales: row.projected_sales, projected_oven_items: row.projected_oven_items, projected_deliveries: row.projected_deliveries,
      required_managers: row.required_managers, required_insiders: row.required_insiders, required_drivers: row.required_drivers,
    }));
    const [{ error: planDailyError }, { error: planIntervalError }] = await Promise.all([
      admin.from("labor_daily_projections").upsert(planDaily, { onConflict: "week_plan_id,day_of_week" }),
      admin.from("labor_demand_intervals").upsert(planIntervals, { onConflict: "week_plan_id,day_of_week,interval_start" }),
    ]);
    if (planDailyError || planIntervalError) throw planDailyError ?? planIntervalError;

    const [{ data: existingShifts, error: existingShiftError }, { data: structuralChanges, error: structuralChangeError }] = await Promise.all([
      admin.from("labor_shifts").select("id,source,assigned_member_id").eq("week_plan_id", plan.id),
      admin.from("labor_shift_changes").select("id").eq("week_plan_id", plan.id).limit(1),
    ]);
    if (existingShiftError || structuralChangeError) throw existingShiftError ?? structuralChangeError;
    const hasStructuralChanges = Boolean(structuralChanges?.length);
    const safeToRebuild = !hasStructuralChanges && (existingShifts ?? []).every((shift) => shift.source === "suggested" && !shift.assigned_member_id);
    editedPlanPreserved = hasStructuralChanges;
    if (safeToRebuild) {
      const { error: deleteShiftError } = await admin.from("labor_shifts").delete().eq("week_plan_id", plan.id).eq("source", "suggested");
      if (deleteShiftError) throw deleteShiftError;
      const suggestedShifts = buildSuggestedShifts(plan.id, rawIntervals, hours, settings);
      if (suggestedShifts.length) {
        const { error: insertShiftError } = await admin.from("labor_shifts").insert(suggestedShifts);
        if (insertShiftError) throw insertShiftError;
      }
    }
  }

  const { data: savedShifts, error: savedShiftError } = planId
    ? await admin.from("labor_shifts").select("id,week_plan_id,day_of_week,role,start_time,end_time,assigned_member_id,notes,source").eq("week_plan_id", planId).order("day_of_week").order("role").order("start_time")
    : { data: [], error: null };
  if (savedShiftError) throw savedShiftError;

  await admin.from("audit_events").insert({
    actor_id: userId, action: "forecast.generated", resource_type: "demand_forecast", resource_id: run.id,
    metadata: { store_id: storeId, week_start: weekStart, confidence_score: score, method_version: "demand-v2", manual_weekly_sales: manualWeeklySales },
  });

  return { run, daily: dailyRows, intervals: intervalRows, shifts: savedShifts ?? [], plan_id: planId, published_plan_preserved: Boolean(existingPlan?.status === "published"), edited_plan_preserved: editedPlanPreserved };
}

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
