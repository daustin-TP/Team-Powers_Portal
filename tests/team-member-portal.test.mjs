import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration=readFileSync("supabase/migrations/20261123143000_team_member_request_portal.sql","utf8");
const app=readFileSync("src/App.tsx","utf8");
const portal=readFileSync("src/components/TeamMemberPortal.tsx","utf8");
const labor=readFileSync("src/components/LaborManagement.tsx","utf8");

test("employee access is server-gated by current active roster status",()=>{
  assert.match(migration,/lower\(access_email\) = email_value/);
  assert.match(migration,/and active\s+and employment_status in \('active','borrowed'\)/);
  assert.match(migration,/revoke all on function public\.team_member_portal_action\(text,jsonb\) from public, anon/);
  assert.match(portal,/setInterval\(focus,15_000\)/);
});

test("team members receive a limited portal rather than full DASH access",()=>{
  assert.match(app,/if \(memberAccess\) return <TeamMemberPortal/);
  assert.match(portal,/My upcoming shifts/);
  assert.match(portal,/Request time off or availability/);
  assert.doesNotMatch(portal,/KPITracker|PayrollCenter|HumanResources/);
});

test("requests support date ranges and multiple recurring weekdays",()=>{
  assert.match(portal,/selectedDates/);
  assert.match(portal,/selected_weekdays:weekdays/);
  assert.match(migration,/cardinality\(dates_value\) > 31/);
  assert.match(migration,/foreach work_day in array req\.selected_dates/);
  assert.match(migration,/foreach weekday_value in array req\.selected_weekdays/);
});

test("manager approval writes protected scheduler availability",()=>{
  assert.match(migration,/source_availability_request_id/);
  assert.match(migration,/if kind_value='approved'/);
  assert.match(labor,/Approve &amp; apply/);
  assert.match(labor,/selected_days:number\[\]/);
});

test("approved requests replace the misleading available label in the week view",()=>{
  assert.match(labor,/if \(rto\)/);
  assert.match(labor,/allDay \? "⛔ Not available"/);
  assert.match(labor,/"✓ Approved request off"/);
  assert.match(labor,/display\.summary/);
});
