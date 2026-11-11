import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const formSource = readFileSync(new URL('../src/components/HumanResources.tsx', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

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
