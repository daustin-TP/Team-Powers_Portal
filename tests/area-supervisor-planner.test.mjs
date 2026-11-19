import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../src/components/AreaSupervisorDashboard.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261119001707_area_supervisor_weekly_planner.sql", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("the Director checklist is represented in the live weekly workspace", () => {
  for (const label of ["Training visits", "Game Day visits", "Opening visit", "Closing visit", "Closed visit", "Rush observation", "Feel-good visit", "Cut test", "One weeknight rush shift", "Friday or Saturday night rush", "Last week’s deposits checked", "GM schedule submitted", "Schedule published"]) {
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

test("the Area Supervisor workspace combines current plans, history, visit logs, and expectations", () => {
  for (const label of ["Current week", "Past weeks", "Visit logs", "Expectations"]) assert.match(component, new RegExp(label));
  assert.match(component, /<SupervisorVisitLog/);
  assert.match(component, /<AreaSupervisorExpectations/);
  assert.doesNotMatch(app, /id: "visit-log", label: "DM Visit Logs"/);
});

test("Game Day is planned once per assigned store", () => {
  assert.match(component, /target: "per-store"/);
  assert.match(component, /purpose === "Game Day visit"/);
  assert.match(component, /assignedStores\.length/);
});

test("Director-authored visit forms are available as sectioned digital templates", () => {
  const templates = readFileSync(new URL("../src/components/VisitTemplateForm.tsx", import.meta.url), "utf8");
  const log = readFileSync(new URL("../src/components/SupervisorVisitLog.tsx", import.meta.url), "utf8");
  for (const label of ["Game Day Sheet", "Opening Visit Evaluation", "Closing Visit Evaluation", "Observation of the Rush"]) assert.match(templates, new RegExp(label));
  assert.match(log, /templateForVisit/);
  assert.match(log, /Optional photos for this section/);
});

test("the per-store checklist excludes the synthetic All Stores record", () => {
  assert.match(component, /function isAllStores/);
  assert.match(component, /filter\(\(store\) => !isAllStores\(store\)\)/);
});

test("visits can be planned instantly by day and saved together", () => {
  assert.match(component, /draggable/);
  assert.match(component, /text\/visit-purpose/);
  assert.match(component, /Drop a visit here or tap \+/);
  assert.match(component, /Save updates/);
  assert.match(component, /15\) % \(24 \* 60\)/);
  assert.match(component, /Complete visit log/);
});

test("all visit types are restricted to the Area Supervisor's assigned stores", () => {
  assert.match(component, /const storesForVisit = \(_purpose: string, currentStoreId\?: string\) => stores\.filter/);
  assert.match(component, /assignedStoreIds\.includes\(store\.id\)/);
  assert.doesNotMatch(component, /\/training\/i\.test\(purpose\)[\s\S]{0,80}\? stores/);
});

test("the weekly board owns schedule editing and visit completion status", () => {
  for (const label of ["Visit completed", "Draft", "Planned", "Save schedule updates", "Save visit changes"]) assert.match(component, new RegExp(label));
  assert.match(component, /visitLogStatuses\[visit\.id\]/);
  assert.match(component, /openScheduledVisitLog/);
});

test("scheduled visits prefill their linked form and provide a printable recap", () => {
  const log = readFileSync(new URL("../src/components/SupervisorVisitLog.tsx", import.meta.url), "utf8");
  const print = readFileSync(new URL("../src/components/VisitPrintRecap.tsx", import.meta.url), "utf8");
  assert.match(log, /scheduledTemplateData/);
  assert.match(log, /store_id,visit_date,start_time,end_time,purpose/);
  assert.match(log, /Print one-page recap/);
  assert.match(log, /Full visit recap/);
  assert.match(print, /Generated from the permanent DASH visit record/);
  assert.match(print, /team-powers-logo\.png/);
});
