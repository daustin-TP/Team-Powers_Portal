import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../supabase/functions/forecast-engine/index.ts', import.meta.url), 'utf8');
const context = {
  exports: {},
  require: () => ({ createClient: () => { throw new Error('Unexpected database access'); } }),
  Deno: { serve: () => {} },
};
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);

const { resolveOvenOutlierDecision } = context.exports;

test('ignore for staffing caps an isolated spike without moving work earlier', () => {
  const decision = resolveOvenOutlierDecision('ignore_staffing', 'week', 40, 8, 0);
  assert.equal(decision.status, 'ignored_week');
  assert.equal(decision.adjustedOven, 8);
  assert.equal(decision.distributedPerRecipient, 0);
});

test('recurring ignore is preserved as a distinct decision', () => {
  assert.equal(resolveOvenOutlierDecision('ignore_staffing', 'recurring', 40, 8, 4).status, 'ignored_recurring');
});

test('prep early remains unresolved when no earlier interval exists', () => {
  assert.equal(resolveOvenOutlierDecision('timed_order', 'week', 40, 8, 0).status, 'unreviewed');
});

test('prep early spreads only the excess across available intervals', () => {
  const decision = resolveOvenOutlierDecision('timed_order', 'recurring', 40, 8, 4);
  assert.equal(decision.status, 'timed_order_recurring');
  assert.equal(decision.adjustedOven, 8);
  assert.equal(decision.distributedPerRecipient, 8);
});
