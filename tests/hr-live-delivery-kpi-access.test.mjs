import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20261111183000_hr_delivery_turnover_kpi_access.sql', import.meta.url), 'utf8');
const functionSource = readFileSync(new URL('../supabase/functions/termination-notifications/index.ts', import.meta.url), 'utf8');
const hrSource = readFileSync(new URL('../src/components/HumanResources.tsx', import.meta.url), 'utf8');

test('live HR delivery uses the outside HR address with configured and assigned-DM CC recipients', () => {
  assert.match(migration, /live_to_recipients = array\['teampowershr@outlook\.com'\]/i);
  assert.match(migration, /daustin@powerspizza\.com/);
  assert.match(migration, /btramont@powerspizza\.com/);
  assert.match(functionSource, /profile_store_assignments/);
  assert.match(functionSource, /role", "supervisor"/);
  assert.match(functionSource, /cc: ccRecipients/);
});

test('all active managers receive store-scoped KPI access by default', () => {
  assert.match(migration, /where role = 'manager' and active = true/i);
  assert.match(migration, /values \(new\.id, 'kpi_view'\)/i);
  assert.doesNotMatch(migration, /values \(new\.id, 'kpi_view_all'\)/i);
});

test('turnover excludes only records explicitly marked as tests', () => {
  assert.match(migration, /exclude_from_turnover boolean not null default false/i);
  assert.match(hrSource, /!event\.exclude_from_turnover/);
});
