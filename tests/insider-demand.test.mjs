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

const { requiredInsidersForOvenDemand } = context.exports;

test('manager covers demand through the configured manager threshold', () => {
  assert.equal(requiredInsidersForOvenDemand(5, 5, 6), 0);
  assert.equal(requiredInsidersForOvenDemand(4.99, 5, 6), 0);
});

test('first insider is required immediately above the manager threshold', () => {
  assert.equal(requiredInsidersForOvenDemand(5.01, 5, 6), 1);
  assert.equal(requiredInsidersForOvenDemand(8, 5, 6), 1);
  assert.equal(requiredInsidersForOvenDemand(10.99, 5, 6), 1);
});

test('additional insiders continue to round down by full capacity blocks', () => {
  assert.equal(requiredInsidersForOvenDemand(11, 5, 6), 1);
  assert.equal(requiredInsidersForOvenDemand(16.99, 5, 6), 1);
  assert.equal(requiredInsidersForOvenDemand(17, 5, 6), 2);
});

test('morning near-threshold rule can add the next insider', () => {
  assert.equal(requiredInsidersForOvenDemand(15.5, 5, 6, false), 1);
  assert.equal(requiredInsidersForOvenDemand(15.5, 5, 6, true), 2);
});

