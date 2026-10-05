import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Batch = {
  id: string;
  store_id: string | null;
  report_family: "kpi_weekly" | "labor_sales" | "labor_oven_items" | "labor_deliveries";
  period_end: string;
  storage_path: string;
};
type Grid = unknown[][];

const text = (value: unknown) => value === null || value === undefined ? "" : String(value).trim();
const number = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = text(value).replace(/[$,%\s,]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};
const cleanMetric = (value: unknown, warnings: string[], label: string) => {
  if (typeof value === "string" && /^#/.test(value)) {
    warnings.push(`${label} was ${value} in the source and was stored as unavailable.`);
    return null;
  }
  return number(value);
};
const extract = (value: unknown, pattern: RegExp, label: string) => {
  const match = text(value).match(pattern);
  if (!match) throw new Error(`Could not read ${label} from the report.`);
  return match[1];
};
const isoDate = (value: string) => {
  const [month, day, year] = value.split("/").map(Number);
  if (!year || !month || !day) throw new Error(`Invalid report date: ${value}`);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};
const addDays = (iso: string, days: number) => {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const inclusiveDays = (begin: string, end: string) =>
  Math.round((new Date(`${end}T12:00:00Z`).getTime() - new Date(`${begin}T12:00:00Z`).getTime()) / 86_400_000) + 1;
const time24 = (value: unknown) => {
  const match = text(value).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return `${String(hour).padStart(2, "0")}:${match[2]}:00`;
};
const isCentralDaylight = (iso: string) => {
  const label = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", timeZoneName: "short" }).format(new Date(`${iso}T18:00:00Z`));
  return label.includes("CDT");
};
const nearlyEqual = (left: number, right: number, tolerance = 0.02) => Math.abs(left - right) <= tolerance;

function firstSheet(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The workbook has no worksheets.");
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null }) as Grid;
}

function detectFamily(grid: Grid): Batch["report_family"] {
  const title = text(grid[0]?.[4]);
  if (/Weekly Summary-Royalty Sales/i.test(title)) return "labor_sales";
  if (/Weekly Summary-All Oven Items/i.test(title)) return "labor_oven_items";
  if (/Weekly Summary-Deliveries/i.test(title)) return "labor_deliveries";
  if (/Keys - Weekly Tracker/i.test(text(grid[0]?.[8]))) return "kpi_weekly";
  throw new Error("This does not match a supported Wizardline Weekly Summary or Keys weekly tracker layout.");
}

async function storeMap(client: ReturnType<typeof createClient>) {
  const { data, error } = await client.from("stores").select("id,name,store_number").eq("active", true);
  if (error) throw error;
  const map = new Map<string, string>();
  for (const store of data ?? []) {
    const number = store.store_number || String(store.name).match(/\b(\d{4})\b/)?.[1];
    if (number) map.set(String(number), store.id);
  }
  return map;
}

async function importLabor(client: ReturnType<typeof createClient>, batch: Batch, grid: Grid) {
  const warnings: string[] = [];
  const storeNumber = extract(grid[0]?.[1], /Store No:\s*(\d+)/i, "store number");
  const begin = isoDate(extract(grid[0]?.[11], /Begin Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i, "begin date"));
  const end = isoDate(extract(grid[1]?.[11], /End Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i, "end date"));
  if (end !== batch.period_end) throw new Error(`The selected period ends ${batch.period_end}, but the report ends ${end}.`);
  const daysInPeriod = inclusiveDays(begin, end);
  if (daysInPeriod < 7 || daysInPeriod % 7 !== 0) throw new Error(`The report period must contain complete Monday-through-Sunday weeks. It shows ${begin} through ${end}.`);
  const weeksCount = daysInPeriod / 7;
  const beginDay = new Date(`${begin}T12:00:00Z`).getUTCDay();
  const endDay = new Date(`${end}T12:00:00Z`).getUTCDay();
  if (beginDay !== 1 || endDay !== 0) throw new Error(`The report period must begin Monday and end Sunday. It shows ${begin} through ${end}.`);
  const expectedDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const headerDays = [2, 3, 5, 6, 7, 8, 9].map((column) => text(grid[3]?.[column]));
  if (headerDays.join("|") !== expectedDays.join("|")) throw new Error("The report's weekday columns do not match the supported Monday-through-Sunday layout.");
  const stores = await storeMap(client);
  const storeId = stores.get(storeNumber);
  if (!storeId) throw new Error(`Store ${storeNumber} is not configured in Dash-OS.`);
  if (batch.store_id && batch.store_id !== storeId) throw new Error(`The selected store does not match Store ${storeNumber} in the report.`);

  const dayColumns = [2, 3, 5, 6, 7, 8, 9];
  const field = batch.report_family === "labor_sales" ? "royalty_sales" : batch.report_family === "labor_oven_items" ? "oven_items" : "delivery_orders";
  const batchField = batch.report_family === "labor_sales" ? "sales_source_batch_id" : batch.report_family === "labor_oven_items" ? "oven_source_batch_id" : "delivery_source_batch_id";
  const parsedRows: Array<Record<string, unknown>> = [];
  let totalsRow: unknown[] | undefined;
  for (let rowIndex = 4; rowIndex < grid.length; rowIndex++) {
    const row = grid[rowIndex] ?? [];
    if (/^Totals:/i.test(text(row[0]))) { totalsRow = row; break; }
    const interval = time24(row[0]);
    if (!interval) continue;
    const dayValues = dayColumns.map((column) => number(row[column]) ?? 0);
    const displayedWeek = number(row[12]) ?? 0;
    const calculatedWeek = dayValues.reduce((sum, value) => sum + value, 0);
    if (!nearlyEqual(displayedWeek, calculatedWeek)) warnings.push(`${text(row[0])}: week total ${displayedWeek} did not match the seven-day sum ${calculatedWeek}.`);
    dayValues.forEach((value, day) => parsedRows.push({
      store_id: storeId,
      business_date: addDays(begin, day),
      interval_start: interval,
      daylight_savings: isCentralDaylight(addDays(begin, day)),
      [batchField]: batch.id,
      [field]: value,
    }));
  }
  if (!parsedRows.length) throw new Error("No 15-minute interval rows were found.");
  if (!totalsRow) throw new Error("The Totals row is missing.");
  for (let day = 0; day < 7; day++) {
    const reportTotal = number(totalsRow[dayColumns[day]]) ?? 0;
    const calculated = parsedRows.filter((row) => row.business_date === addDays(begin, day)).reduce((sum, row) => sum + Number(row[field]), 0);
    if (!nearlyEqual(reportTotal, calculated)) warnings.push(`Day ${day + 1}: report total ${reportTotal} did not match parsed total ${calculated}.`);
  }
  const reportWeek = number(totalsRow[12]) ?? 0;
  const parsedWeek = parsedRows.reduce((sum, row) => sum + Number(row[field]), 0);
  if (!nearlyEqual(reportWeek, parsedWeek)) throw new Error(`Report total ${reportWeek} did not match parsed total ${parsedWeek}.`);

  if (weeksCount > 1) {
    const startIsDaylight = isCentralDaylight(begin);
    const endIsDaylight = isCentralDaylight(end);
    const previousDayMatchesStart = isCentralDaylight(addDays(end, -1)) === startIsDaylight;
    if (startIsDaylight !== endIsDaylight && !previousDayMatchesStart) throw new Error("A historical baseline report cannot cross a daylight-saving boundary except on its final Sunday. Export the daylight and non-daylight periods separately.");
    const season = startIsDaylight ? "daylight" : "non_daylight";
    const { data: baseline, error: baselineError } = await client.from("labor_baseline_sets").upsert({
      store_id: storeId,
      season,
      period_start: begin,
      period_end: end,
      weeks_count: weeksCount,
      status: "actual",
      source_label: `Wizardline ${weeksCount}-week baseline`,
      active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: "store_id,season,period_start,period_end" }).select("id").single();
    if (baselineError || !baseline) throw baselineError ?? new Error("The historical baseline could not be created.");

    const rawField = batch.report_family === "labor_sales" ? "raw_sales_total" : batch.report_family === "labor_oven_items" ? "raw_oven_items_total" : "raw_delivery_total";
    const averageField = batch.report_family === "labor_sales" ? "avg_sales" : batch.report_family === "labor_oven_items" ? "avg_oven_items" : "avg_deliveries";
    const baselineBatchField = batch.report_family === "labor_sales" ? "sales_source_batch_id" : batch.report_family === "labor_oven_items" ? "oven_source_batch_id" : "delivery_source_batch_id";
    const { error: baselineResetError } = await client.from("labor_baseline_intervals").update({
      [rawField]: 0,
      [averageField]: 0,
      [baselineBatchField]: batch.id,
      updated_at: new Date().toISOString(),
    }).eq("baseline_set_id", baseline.id);
    if (baselineResetError) throw baselineResetError;
    const baselineRows = parsedRows.map((row) => ({
      baseline_set_id: baseline.id,
      store_id: storeId,
      day_of_week: Math.round((new Date(`${String(row.business_date)}T12:00:00Z`).getTime() - new Date(`${begin}T12:00:00Z`).getTime()) / 86_400_000),
      interval_start: row.interval_start,
      [rawField]: Number(row[field]),
      [averageField]: Number(row[field]) / weeksCount,
      [baselineBatchField]: batch.id,
      updated_at: new Date().toISOString(),
    }));
    const { error: baselineRowsError } = await client.from("labor_baseline_intervals").upsert(baselineRows, { onConflict: "baseline_set_id,day_of_week,interval_start" });
    if (baselineRowsError) throw baselineRowsError;
    await client.from("report_import_batches").update({ period_start: begin }).eq("id", batch.id);
    return { rowCount: baselineRows.length, warnings, metadata: { mode: "baseline", storeNumber, begin, end, weeks: weeksCount, season, reportTotal: reportWeek, field } };
  }

  // Wizardline omits quarter-hour rows that are zero across all seven days in
  // some report families (notably Deliveries). Reset only this metric for the
  // imported week before upserting so a corrected re-upload cannot preserve a
  // stale nonzero value from an earlier file.
  const { error: resetError } = await client
    .from("labor_metric_intervals")
    .update({ [field]: 0, [batchField]: batch.id })
    .eq("store_id", storeId)
    .gte("business_date", begin)
    .lte("business_date", end);
  if (resetError) throw resetError;

  const { error } = await client.from("labor_metric_intervals").upsert(parsedRows, { onConflict: "store_id,business_date,interval_start" });
  if (error) throw error;
  await client.from("report_import_batches").update({ period_start: begin }).eq("id", batch.id);
  return { rowCount: parsedRows.length, warnings, metadata: { mode: "weekly", storeNumber, begin, end, weeks: 1, reportTotal: reportWeek, field } };
}

const primaryColumns: Record<string, number> = {
  royalty_sales: 2, sales_last_year: 4, yoy_sales_percent: 6, order_count: 7,
  orders_last_year: 9, order_growth_percent: 10, labor_dollars: 11, labor_percent: 12,
  splh: 13, ot_hours: 14, actual_food_percent: 15, ideal_food_percent: 16,
  food_difference_dollars: 18, food_difference_percent: 20, cash_over_short: 21, avg_load: 22,
};
const serviceColumns: Record<string, number> = {
  avg_etd: 2, etd_under_30_percent: 4, extreme_order_count: 6, extreme_order_percent: 7,
  avg_wait: 9, singles_percent: 10, new_customers: 11, cheese_variance: 12,
  pepperoni_variance: 13, dough_variance: 14, average_ticket: 15, st_jude_net: 16,
};

function tableRows(grid: Grid, start: number) {
  const rows: unknown[][] = [];
  for (let index = start; index < grid.length; index++) {
    const row = grid[index] ?? [];
    const store = text(row[0]);
    if (/^Totals:/i.test(store)) break;
    if (/^\d{4}$/.test(store)) rows.push(row);
  }
  return rows;
}

async function importKpi(client: ReturnType<typeof createClient>, batch: Batch, grid: Grid) {
  const warnings: string[] = [];
  const begin = isoDate(extract(grid[0]?.[19], /Begin Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i, "begin date"));
  const end = isoDate(extract(grid[1]?.[19], /End Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i, "end date"));
  if (end !== batch.period_end) throw new Error(`The selected week ends ${batch.period_end}, but the report ends ${end}.`);
  if (end !== addDays(begin, 6)) throw new Error(`The KPI report period must cover Monday through Sunday. It shows ${begin} through ${end}.`);
  const stores = await storeMap(client);
  const primary = tableRows(grid, 4);
  const secondHeader = grid.findIndex((row, index) => index > 4 && text(row?.[0]) === "Store Number");
  if (!primary.length || secondHeader < 0) throw new Error("The KPI workbook is missing one of its two store tables.");
  const service = new Map(tableRows(grid, secondHeader + 1).map((row) => [text(row[0]), row]));
  const upserts: Array<{ store_id: string; week_end: string; metrics: Record<string, unknown>; source_batch_id: string; updated_at: string }> = [];
  for (const row of primary) {
    const storeNumber = text(row[0]);
    const storeId = stores.get(storeNumber);
    if (!storeId) { warnings.push(`Store ${storeNumber} is not configured in Dash-OS and was skipped.`); continue; }
    const metrics: Record<string, unknown> = { store_number: storeNumber, report_begin: begin, report_end: end };
    for (const [key, column] of Object.entries(primaryColumns)) metrics[key] = cleanMetric(row[column], warnings, `Store ${storeNumber} ${key}`);
    const serviceRow = service.get(storeNumber);
    if (!serviceRow) warnings.push(`Store ${storeNumber} is missing from the service-metrics table.`);
    else for (const [key, column] of Object.entries(serviceColumns)) metrics[key] = cleanMetric(serviceRow[column], warnings, `Store ${storeNumber} ${key}`);
    // Compatibility aliases used by the first Dash-OS KPI screen.
    metrics.avg_adt = metrics.avg_etd;
    metrics.adt_under_30_percent = metrics.etd_under_30_percent;
    upserts.push({ store_id: storeId, week_end: end, metrics, source_batch_id: batch.id, updated_at: new Date().toISOString() });
  }
  if (!upserts.length) throw new Error("No configured stores were found in the KPI report.");
  const { error } = await client.from("kpi_weekly_results").upsert(upserts, { onConflict: "store_id,week_end" });
  if (error) throw error;
  return { rowCount: upserts.length, warnings, metadata: { begin, end, storesImported: upserts.length, storesInReport: primary.length } };
}

Deno.serve(async (request) => {
  let batchId: string | null = null;
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const headers = { ...corsHeaders, "Content-Type": "application/json" };
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Missing authorization." }), { status: 401, headers });
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Invalid session." }), { status: 401, headers });
    const admin = createClient(url, service);
    const { data: profile } = await admin.from("profiles").select("role,active").eq("id", user.id).maybeSingle();
    if (!profile?.active || !["supervisor", "admin"].includes(profile.role)) return new Response(JSON.stringify({ error: "Weekly imports require supervisor or administrator access." }), { status: 403, headers });
    const { batch_id } = await request.json();
    batchId = batch_id;
    const { data: batch, error: batchError } = await admin.from("report_import_batches").select("id,store_id,report_family,period_end,storage_path").eq("id", batch_id).single();
    if (batchError || !batch) throw batchError ?? new Error("Import batch not found.");
    await admin.from("report_import_batches").update({ status: "processing", error_message: null }).eq("id", batch.id);
    const { data: file, error: fileError } = await admin.storage.from("operating-reports").download(batch.storage_path);
    if (fileError || !file) throw fileError ?? new Error("Uploaded report could not be downloaded.");
    const grid = firstSheet(await file.arrayBuffer());
    const detected = detectFamily(grid);
    if (detected !== batch.report_family) throw new Error(`The selected report type was ${batch.report_family}, but the file layout is ${detected}.`);
    const result = detected === "kpi_weekly" ? await importKpi(admin, batch as Batch, grid) : await importLabor(admin, batch as Batch, grid);
    const status = result.warnings.length ? "needs_review" : "ready";
    await admin.from("report_import_batches").update({ status, row_count: result.rowCount, warnings: result.warnings, completed_at: new Date().toISOString() }).eq("id", batch.id);
    return new Response(JSON.stringify({ ok: true, status, ...result }), { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      if (batchId) await admin.from("report_import_batches").update({ status: "failed", error_message: message, completed_at: new Date().toISOString() }).eq("id", batchId);
    } catch { /* The response still reports the original failure. */ }
    return new Response(JSON.stringify({ error: message }), { status: 400, headers });
  }
});
