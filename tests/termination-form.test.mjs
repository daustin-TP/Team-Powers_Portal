import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const formSource = readFileSync(new URL('../src/components/HumanResources.tsx', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const autoTerminateMigration = readFileSync(new URL('../supabase/migrations/20261111170000_terminate_roster_from_hr_action.sql', import.meta.url), 'utf8');

test('termination form uses circumstances for the constrained incident summary without a duplicate reason field', () => {
  assert.doesNotMatch(formSource, />Reason for separation<textarea/);
  assert.match(formSource, /incident_summary: form\.action_type === "termination" \? form\.separation_description\.trim\(\)/);
  assert.match(formSource, /separation_description\.trim\(\)\.length < 10/);
});

test('missing termination requirements receive the red required state', () => {
  assert.match(formSource, /hr-required-missing/);
  assert.match(styleSource, /\.hr-form-grid \.hr-required-missing/);
  assert.match(styleSource, /#fff5f5/);
});

test('saving termination paperwork atomically removes the selected employee from active scheduling', () => {
  assert.match(autoTerminateMigration, /after insert on public\.hr_disciplinary_actions/i);
  assert.match(autoTerminateMigration, /set employment_status = 'terminated'/i);
  assert.match(autoTerminateMigration, /active = false/i);
  assert.match(autoTerminateMigration, /linked_hr_action_id = new\.id/i);
});
