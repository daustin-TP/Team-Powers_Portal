import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const regional = readFileSync(new URL('../src/components/KPIRegionalPlans.tsx', import.meta.url), 'utf8');
const tracker = readFileSync(new URL('../src/components/KPITracker.tsx', import.meta.url), 'utf8');
const edge = readFileSync(new URL('../supabase/functions/kpi-plans/index.ts', import.meta.url), 'utf8');
const email = readFileSync(new URL('../supabase/functions/kpi-plans/notifications.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261116153119_kpi_regional_plan_notifications.sql', import.meta.url), 'utf8');

test('KPI follow-up has a separate action tab with visible counts', () => {
  assert.match(tracker, /Follow-Up/);
  assert.match(tracker, /kpi-tab-notification/);
  assert.match(regional, /Needs action/);
  assert.match(regional, /Past follow-up date/);
  assert.match(regional, /Completed/);
});

test('released plans notify the assigned Area Supervisor once', () => {
  assert.match(edge, /notifyRegionalPlanReleased/);
  assert.match(email, /KPI Dashboard → Follow-Up/);
  assert.match(email, /DASH-OS KPI Follow-Up/);
  assert.match(migration, /unique \(plan_id, event, recipient_profile_id\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all .* anon, authenticated/);
});
