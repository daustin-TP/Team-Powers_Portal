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
const { buildSuggestedShifts } = context.exports;
const clock = (minute) => `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}:00`;
const minute = (time) => {
  const [hour, part] = time.slice(0, 5).split(':').map(Number);
  const value = hour * 60 + part;
  return value < 540 ? value + 1440 : value;
};
const covers = (shift, at) => minute(shift.start_time) <= at && at < minute(shift.end_time);

test('rebuild treats a manager-added insider shift as fixed coverage and fills only the remaining gaps', () => {
  const intervals = [];
  for (let at = 600; at < 1320; at += 15) {
    const requiredInsiders = at >= 960 && at < 1185 ? (at === 1140 ? 2 : 1) : 0;
    intervals.push({ day_of_week: 0, interval_start: clock(at), required_insiders: requiredInsiders, required_drivers: 1 });
  }
  const fixed = [{ day_of_week: 0, role: 'insider', start_time: '11:00:00', end_time: '19:00:00' }];
  const generated = buildSuggestedShifts('test', intervals, new Map([[0, { open: '10:00', close: '22:00' }]]), {
    minimum_shift_hours: 3, max_shift_hours: 9, driver_postclose_minutes: 60,
    late_driver_rule: 'until_close', opening_driver_through_rush: true,
  }, fixed).filter((shift) => shift.role === 'insider');

  assert.ok(!generated.some((shift) => shift.start_time === '11:00:00' && shift.end_time === '19:00:00'), 'fixed shift is preserved by the caller, not recreated');
  for (const row of intervals.filter((item) => item.required_insiders > 0)) {
    const at = minute(row.interval_start);
    const coverage = fixed.filter((shift) => covers(shift, at)).length + generated.filter((shift) => covers(shift, at)).length;
    assert.ok(coverage >= row.required_insiders, `insider coverage at ${row.interval_start}`);
  }
  assert.ok(generated.some((shift) => minute(shift.end_time) >= 1185), 'a generated shift continues through the final 7:30 PM demand interval');
});

test('rebuild fills management coverage around an assigned manager shift without replacing it', () => {
  const fixed = [{ day_of_week: 0, role: 'manager', start_time: '09:00:00', end_time: '18:00:00' }];
  const generated = buildSuggestedShifts('test', [], new Map([[0, { open: '10:00', close: '22:00' }]]), {
    minimum_shift_hours: 3, max_shift_hours: 9, manager_preopen_minutes: 60, manager_postclose_minutes: 60,
    driver_postclose_minutes: 60, late_driver_rule: 'until_close',
  }, fixed).filter((shift) => shift.role === 'manager');

  for (let at = 540; at < 1380; at += 15) {
    const coverage = fixed.filter((shift) => covers(shift, at)).length + generated.filter((shift) => covers(shift, at)).length;
    assert.ok(coverage >= 1, `manager coverage at ${clock(at)}`);
  }
  assert.ok(!generated.some((shift) => shift.start_time === '09:00:00' && shift.end_time === '18:00:00'));
});
