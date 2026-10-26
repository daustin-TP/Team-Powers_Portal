import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import vm from 'node:vm';

const source = readFileSync(new URL('../supabase/functions/forecast-engine/index.ts', import.meta.url), 'utf8');
const context = {
  exports: {}, Intl, Date, console,
  require: () => ({ createClient: () => { throw new Error('Unexpected database access'); } }),
  Deno: { serve: () => {} },
};
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);

const { seasonalTransitionWeight, shiftedSeasonalInterval } = context.exports;

test('non-daylight fallback shifts demand 45 minutes earlier', () => {
  assert.equal(shiftedSeasonalInterval('18:00', 'non_daylight'), '17:15');
  assert.equal(shiftedSeasonalInterval('18:00', 'daylight'), '18:45');
});

test('first post-clock-change weeks receive extra weight', () => {
  assert.equal(seasonalTransitionWeight('2026-11-02'), 4);
  assert.equal(seasonalTransitionWeight('2026-11-09'), 3.25);
  assert.equal(seasonalTransitionWeight('2026-11-16'), 2.5);
  assert.equal(seasonalTransitionWeight('2026-11-23'), 1.75);
  assert.equal(seasonalTransitionWeight('2026-12-07'), 1);
});
