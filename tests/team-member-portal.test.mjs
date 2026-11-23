import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration=readFileSync("supabase/migrations/20261123143000_team_member_request_portal.sql","utf8");
const app=readFileSync("src/App.tsx","utf8");
const portal=readFileSync("src/components/TeamMemberPortal.tsx","utf8");
const labor=readFileSync("src/components/LaborManagement.tsx","utf8");
const recurringMigration=readFileSync("supabase/migrations/20261123181500_recurring_availability_change_requests.sql","utf8");
const cutoffMigration=readFileSync("supabase/migrations/20261123190000_team_member_request_cutoff.sql","utf8");

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

test("team members see current recurring availability and may request more availability",()=>{
  assert.match(portal,/Current weekly availability/);
  assert.match(portal,/Available all day/);
  assert.match(portal,/Available only during set hours/);
  assert.match(portal,/chooseRecurringDay/);
  assert.match(recurringMigration,/standard_availability/);
});

test("recurring changes require a valid reason and manager approval",()=>{
  assert.match(portal,/A valid reason is required for every recurring availability change/);
  assert.match(recurringMigration,/length\(note_value\) < 5/);
  assert.match(recurringMigration,/if decision_value='approved'/);
  assert.match(recurringMigration,/req\.recurring_status in \('available','limited'\)/);
  assert.match(labor,/Approve &amp; apply/);
});

test("one-time requests close before managers begin the target schedule",()=>{
  assert.match(portal,/earliestRequestDate/);
  assert.match(portal,/Request-off dates close the Sunday before managers begin that schedule/);
  assert.match(cutoffMigration,/America\/Chicago/);
  assert.match(cutoffMigration,/date_trunc\('week'/);
  assert.match(cutoffMigration,/requested_date::timestamp\)::date - 8/);
  assert.match(cutoffMigration,/new\.request_kind = 'one_time'/);
});

test("managers see the Central submission timestamp before reviewing a request",()=>{
  assert.match(labor,/formatRequestTimestamp/);
  assert.match(labor,/timeZone: "America\/Chicago"/);
  assert.match(labor,/Submitted \{formatRequestTimestamp\(request\.created_at\)\}/);
});
