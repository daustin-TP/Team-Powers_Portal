import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync(new URL("../src/components/AreaSupervisorDashboard.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261119001707_area_supervisor_weekly_planner.sql", import.meta.url), "utf8");
const cutTestMigration = readFileSync(new URL("../supabase/migrations/20261123210000_supervisor_cut_tests.sql", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("the Director checklist is represented in the live weekly workspace", () => {
  for (const label of ["General Supervisor Visits", "Game Day visits", "Opening visit", "Closing visit", "Closed visit", "Rush observation", "Feel-good visit", "Cut test", "One weeknight rush shift", "Friday or Saturday night rush", "Last week’s deposits checked", "GM schedule submitted", "Schedule published"]) {
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

test("General Supervisor Visits are first, per-store, and open the standard linked log", () => {
  const log = readFileSync(new URL("../src/components/SupervisorVisitLog.tsx", import.meta.url), "utf8");
  assert.match(component, /label: "General Supervisor Visits", target: "per-store"/);
  assert.match(component, /visitOptions = \["General Supervisor Visit"/);
  assert.match(component, /new Set\(matchingVisits\.map\(\(visit\) => visit\.store_id\)\)\.size/);
  assert.match(component, /connectedLogTypes/);
  assert.match(log, /visitType: "General Supervisor Visit"/);
  assert.match(log, /const visitType = data\.purpose\?\.trim\(\) \|\| "General Supervisor Visit"/);
  assert.match(log, /\.eq\("schedule_id", requestedScheduleId\)/);
});

test("cut tests are per-store checklist evidence rather than scheduled visits", () => {
  assert.doesNotMatch(component, /purpose === "Cut test"/);
  assert.doesNotMatch(component, /visitOptions = \[[^\]]*"Cut test"/);
  assert.match(component, /One cut test is required per store each week/);
  assert.match(component, /Add another/);
  assert.match(component, /Who made it\?/);
  assert.match(component, /Great/);
  assert.match(component, /Remake/);
  assert.match(component, /capture="environment"/);
  assert.match(cutTestMigration, /Multiple tests are intentionally allowed/);
  assert.doesNotMatch(cutTestMigration, /unique\s*\(\s*supervisor_id\s*,\s*week_start\s*,\s*store_id/);
  assert.match(cutTestMigration, /enable row level security/);
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

test("visits can be placed on an hourly week timeline and saved together", () => {
  assert.match(component, /draggable/);
  assert.match(component, /text\/visit-purpose/);
  assert.match(component, /timelineStartMinutes = 7 \* 60/);
  assert.match(component, /timelineEndMinutes = 25 \* 60/);
  assert.match(component, /stageVisitAt/);
  assert.match(component, /placeVisitInSlot/);
  assert.match(component, /Save schedule updates/);
  assert.match(component, /15\) % \(24 \* 60\)/);
  assert.match(component, /Complete visit log/);
});

test("scheduled visits move and resize in half-hour steps", () => {
  assert.match(component, /text\/scheduled-visit/);
  assert.match(component, /timelineRowHeights = \{ 65: 18, 80: 26, 100: 34 \}/);
  assert.match(component, /slotChange \* 30/);
  assert.match(component, /timeline-resize-handle/);
  assert.match(component, /Duration adjusted on the weekly timeline/);
});

test("the weekly timeline supports a remembered compact-to-large zoom", () => {
  assert.match(component, /dashos:supervisor-timeline-zoom:/);
  assert.match(component, /Schedule size/);
  assert.match(component, /\(\[65, 80, 100\] as const\)/);
  assert.match(component, /timeline-zoom-/);
});

test("visit log and delete controls remain prominent in the compact timeline", () => {
  assert.match(component, /timeline-log-button/);
  assert.match(component, /timeline-delete-button/);
  assert.match(component, /Complete visit log/);
  assert.match(component, /Delete visit/);
});

test("all visit types are restricted to the Area Supervisor's assigned stores", () => {
  assert.match(component, /const storesForVisit = \(_purpose: string, currentStoreId\?: string \| null\) => stores\.filter/);
  assert.match(component, /assignedStoreIds\.includes\(store\.id\)/);
  assert.doesNotMatch(component, /\/training\/i\.test\(purpose\)[\s\S]{0,80}\? stores/);
});

test("Other is a store-free activity and Training uses a private photo instead of a visit log", () => {
  const photo = readFileSync(new URL("../src/components/TrainingVisitPhoto.tsx", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../supabase/migrations/20261124141500_supervisor_schedule_activities.sql", import.meta.url), "utf8");
  assert.match(component, /What is the activity\?/);
  assert.match(component, /store_id: visit\.purpose === "Other" \? null/);
  assert.match(component, /option !== "Other" && !isTrainingVisit\(option\)/);
  assert.match(component, /<TrainingVisitPhoto/);
  assert.match(photo, /createSignedUrl/);
  assert.match(migration, /purpose = 'Other' and nullif\(btrim\(notes\), ''\) is not null/);
  assert.match(migration, /visit\.supervisor_id = \(select auth\.uid\(\)\)/);
});

test("the weekly board owns schedule editing and visit completion status", () => {
  for (const label of ["Completed", "Draft", "Planned", "Save schedule updates", "Save visit changes"]) assert.match(component, new RegExp(label));
  assert.match(component, /visitLogStatuses\[visit\.id\]/);
  assert.match(component, /openScheduledVisitLog/);
});

test("scheduled visits prefill their linked form and provide a printable recap", () => {
  const log = readFileSync(new URL("../src/components/SupervisorVisitLog.tsx", import.meta.url), "utf8");
  const print = readFileSync(new URL("../src/lib/visitPdf.ts", import.meta.url), "utf8");
  assert.match(log, /scheduledTemplateData/);
  assert.match(log, /store_id,visit_date,start_time,end_time,purpose/);
  assert.match(log, /Print visit recap/);
  assert.match(log, /Print paper form/);
  assert.match(log, /visitNotes\[activeStep\.key\]/);
  assert.match(log, /Visit notes by section/);
  assert.match(log, /setPreview\(!ownVisit\)/);
  assert.match(log, /setStepIndex\(backup\?\.stepIndex \?\? 0\)/);
  assert.match(log, /sessionStorage\.setItem\(key, JSON\.stringify\(snapshot\)\)/);
  assert.match(log, /Full visit recap/);
  assert.match(print, /format: "letter"/);
  assert.match(print, /columns.length > 2 \* size.perPage/);
});

test("released KPI action plans appear in Area Focus and can be updated without leaving the field dashboard", () => {
  assert.match(component, /supabase\.functions\.invoke\("kpi-plans", \{ body: \{ action: "list" \} \}\)/);
  assert.match(component, /regionalPlanApplies/);
  assert.match(component, /Director action plan/);
  assert.match(component, /Outcome \/ field evidence/);
  assert.match(component, /Save follow-up/);
  assert.match(component, /This updates the same Regional KPI Plan used by the Director/);
});
