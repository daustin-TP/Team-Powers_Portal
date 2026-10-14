import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// Run the real Edge Function scheduling code without starting its HTTP server
// or connecting to Supabase.
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
  const [h, m] = time.split(':').map(Number);
  const value = h * 60 + m;
  return value < 570 ? value + 1440 : value;
};

test('delivery demand in the final hour is retained even when the late driver leaves early', () => {
  const intervals = [];
  for (let time = 600; time < 1440; time += 15) {
    intervals.push({ day_of_week: 0, interval_start: clock(time), required_insiders: 0, required_drivers: time >= 1260 ? 4 : 1 });
  }
  const shifts = buildSuggestedShifts('test', intervals, new Map([[0, { open: '10:00', close: '00:00' }]]), {
    minimum_shift_hours: 3, max_shift_hours: 9, driver_postclose_minutes: 60,
    late_driver_rule: 'hour_before_close', opening_driver_through_rush: true,
  }).filter((shift) => shift.role === 'driver');
  for (let time = 1260; time < 1440; time += 15) {
    assert.ok(shifts.filter((shift) => minute(shift.start_time) <= time && minute(shift.end_time) > time).length >= 4);
  }
  assert.ok(shifts.some((shift) => shift.end_time === '01:00:00'));
});

test('missing demand rows still produce closing and late-driver coverage', () => {
  const shifts = buildSuggestedShifts('test', [], new Map([[0, { open: '10:00', close: '22:00' }]]), {
    minimum_shift_hours: 3, max_shift_hours: 9, driver_postclose_minutes: 60,
    late_driver_rule: 'until_close',
  }).filter((shift) => shift.role === 'driver');
  assert.ok(shifts.some((shift) => shift.end_time === '23:00:00'));
  assert.ok(shifts.some((shift) => shift.end_time === '22:00:00'));
});

for (const rule of ['hour_before_close', 'until_close', 'second_closer']) {
  for (const close of [22 * 60, 24 * 60, 25 * 60]) {
    for (const clean of [0, 15, 60, 120]) {
      for (const throughRush of [false, true]) {
        test(`${rule}: close ${clock(close)}, clean ${clean}, through rush ${throughRush}`, () => {
          const intervals = [];
          for (let time = 10 * 60; time < close; time += 15) {
            intervals.push({ day_of_week: 0, interval_start: clock(time), required_insiders: 0, required_drivers: 1 });
          }
          const settings = {
            minimum_shift_hours: 3, max_shift_hours: 9,
            driver_preopen_minutes: 30, driver_postclose_minutes: clean,
            late_driver_rule: rule, opening_driver_through_rush: throughRush,
          };
          const shifts = buildSuggestedShifts('test', intervals, new Map([[0, { open: '10:00', close: clock(close) }]]), settings)
            .filter((shift) => shift.role === 'driver')
            .map((shift) => ({ start: minute(shift.start_time), end: minute(shift.end_time) }));
          const end = close + clean;
          const lateEnd = rule === 'hour_before_close' ? close - 60 : rule === 'until_close' ? close : end;
          const ends = shifts.map((shift) => shift.end).sort((a, b) => b - a);
          assert.equal(ends[0], end, 'final driver stays through cleanup');
          assert.equal(ends[1], lateEnd, 'second-to-last driver follows late-driver rule');
          for (let time = 570; time < end; time += 15) {
            const needed = time >= lateEnd - 180 && time < lateEnd ? 2 : 1;
            assert.ok(shifts.filter((shift) => shift.start <= time && time < shift.end).length >= needed, `coverage at ${clock(time)}`);
          }
          for (const shift of shifts) assert.ok(shift.end - shift.start >= 180 && shift.end - shift.start <= 540, 'shift length limits');
        });
      }
    }
  }
}
