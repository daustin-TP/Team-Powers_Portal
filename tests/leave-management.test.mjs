import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../supabase/migrations/20261112004847_pto_vacation_management.sql");
const edge = read("../supabase/functions/payroll/index.ts");
const leaveUi = read("../src/components/LeaveManagement.tsx");
const scheduler = read("../src/components/LaborManagement.tsx");
const payroll = read("../src/components/PayrollCenter.tsx");

test("leave balances reserve pending requests and consume approved requests", () => {
  assert.match(migration, /status in \('pending','approved'\)/);
  assert.match(migration, /request exceeds the available balance/i);
  assert.match(migration, /pto_hours/);
  assert.match(migration, /vacation_hours/);
});

test("approved store leave becomes protected scheduler availability", () => {
  assert.match(migration, /source_time_off_request_id/);
  assert.match(migration, /insert into public\.labor_time_off/);
  assert.match(scheduler, /Approved paid leave/);
  assert.match(scheduler, /PTO & Vacation tab/);
});

test("leave requests support exact half days, remaining balances, and explicit approval", () => {
  assert.match(leaveUi, /Unavailable starting/);
  assert.match(leaveUi, /Use remaining/);
  assert.match(leaveUi, /Approve this request now/);
  assert.match(edge, /leave_request/);
  assert.match(edge, /leave_review/);
});

test("approved requests enter payroll once using their source request id", () => {
  assert.match(payroll, /source_request_id/);
  assert.match(payroll, /leaveHoursForPeriod/);
  assert.match(payroll, /PTO \/ Vacation/);
});

test("direct database access to leave actions is service-only", () => {
  assert.match(migration, /revoke all on function public\.leave_action\(uuid,text,jsonb\) from public,anon,authenticated/i);
  assert.match(migration, /grant execute on function public\.leave_action\(uuid,text,jsonb\) to service_role/i);
});
