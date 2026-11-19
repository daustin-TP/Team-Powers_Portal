import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../src/components/AreaSupervisorDashboard.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261119001707_area_supervisor_weekly_planner.sql", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("the Director checklist is represented in the live weekly workspace", () => {
  for (const label of ["Training visits", "Opening visit", "Closing visit", "Closed visit", "Rush observation", "Feel-good visit", "Cut test", "One weeknight rush shift", "Friday or Saturday night rush", "Last week’s deposits checked", "GM schedule submitted", "Schedule published"]) {
    assert.match(component, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("Area Supervisors can only read and edit their own weekly plans", () => {
  assert.match(migration, /current_portal_role\(\)\) = 'admin'/);
  assert.match(migration, /current_portal_role\(\)\) = 'supervisor'[\s\S]*supervisor_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /alter table public\.supervisor_weekly_plans enable row level security/);
  assert.match(migration, /supervisor_weekly_plan_history/);
});

test("the private dashboard is available only to Area Supervisors and administrators", () => {
  assert.match(app, /id: "supervisor-dashboard"[\s\S]*roles: \["supervisor", "admin"\]/);
  assert.match(component, /supervisor_visit_schedules/);
  assert.match(component, /kpi-dashboard/);
});

test("the Area Supervisor workspace combines current plans, history, and visit logs", () => {
  for (const label of ["Current week", "Past weeks", "Visit logs"]) assert.match(component, new RegExp(label));
  assert.match(component, /<SupervisorVisitLog/);
  assert.doesNotMatch(app, /id: "visit-log", label: "DM Visit Logs"/);
});

test("the per-store checklist excludes the synthetic All Stores record", () => {
  assert.match(component, /function isAllStores/);
  assert.match(component, /filter\(\(store\) => !isAllStores\(store\)\)/);
});
