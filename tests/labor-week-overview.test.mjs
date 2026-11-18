import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const labor = readFileSync(new URL('../src/components/LaborManagement.tsx', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261118100000_allow_no_required_late_driver.sql', import.meta.url), 'utf8');

test('week schedule view includes every team member and workload flags', () => {
  assert.match(labor, />Week<\/span><small>\{members\.filter/);
  assert.match(labor, /Team schedule overview/);
  assert.match(labor, /Not scheduled/);
  assert.match(labor, /Close to overtime/);
  assert.match(labor, /Overtime \+\$\{/);
  assert.match(labor, /days scheduled/);
});

test('closing drivers sort after other driver shifts', () => {
  assert.match(labor, /Number\(isClosingDriver\(left\)\) - Number\(isClosingDriver\(right\)\)/);
  assert.match(labor, /Closing drivers stay at the bottom/);
});

test('late-driver settings allow no required second driver and oven controls use tenths', () => {
  assert.match(labor, /option value="none">No required late driver/);
  assert.equal((labor.match(/<input type="number" step="0\.1" value=\{settings\.(?:weekend_)?(?:insider|manager)_items_per_15\}/g) ?? []).length, 4);
  assert.match(migration, /'none'.*'hour_before_close'.*'until_close'.*'second_closer'/s);
});
