import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const functionSource = readFileSync(new URL("../supabase/functions/evaluation-reminders/index.ts", import.meta.url), "utf8");
const workerSource = readFileSync(new URL("../supabase/functions/payroll-worker/index.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20261111103000_evaluation_reminders_and_preferred_names.sql", import.meta.url), "utf8");
const calendar = readFileSync(new URL("../src/components/OperationsCalendar.tsx", import.meta.url), "utf8");
const roster = readFileSync(new URL("../src/components/LaborManagement.tsx", import.meta.url), "utf8");

test("preferred names are stored privately and used only for celebration labels", () => {
  assert.match(migration, /preferred_name text not null default ''/);
  assert.match(roster, /Celebration names/);
  assert.match(roster, /Used only for birthday and anniversary cards/);
  assert.match(calendar, /detail\.preferred_name\?\.trim\(\) \|\| member\.display_name/g);
});

test("evaluation reminders are service-only, morning-only, and idempotent", () => {
  assert.match(functionSource, /token !== serviceKey/);
  assert.match(functionSource, /hour < 7 \|\| hour >= 11/);
  assert.match(migration, /unique \(member_id, evaluation_type, due_date, event, notification_date, recipient_email\)/);
  assert.match(functionSource, /event: "past_due", notificationDate: today/);
  assert.match(functionSource, /event: "available", notificationDate: availableDate/);
  assert.match(functionSource, /eq\("role", "manager"\)/);
});

test("the existing secure worker triggers evaluation reminders", () => {
  assert.match(workerSource, /functions\/v1\/evaluation-reminders/);
  assert.match(workerSource, /"Authorization":`Bearer \$\{key\}`/);
});

test("pre-November drafts are closed at go-live", () => {
  assert.match(migration, /where status = 'draft'[\s\S]*due_date < date '2026-11-01'/);
  assert.match(migration, /Automatically closed at DASH evaluation go-live/);
});
