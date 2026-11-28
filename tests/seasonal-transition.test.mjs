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

const { seasonalTransitionWeight, shiftedSeasonalInterval, unusableDemandDates } = context.exports;

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

test('a zero or omitted Thanksgiving excludes only Thursday from daily history and skips the holiday week total', () => {
  const sales = (date, value) => ({ business_date: date, royalty_sales: value, sales_source_batch_id: 'sales-upload' });
  const openDays = new Set([0, 1, 2, 3, 4, 5, 6]);
  const otherDays = ['23', '24', '25', '27', '28', '29'].map(day => sales(`2026-11-${day}`, 1000));
  const priorWeek = ['16', '17', '18', '19', '20', '21', '22'].map(day => sales(`2026-11-${day}`, 900));
  priorWeek.push(sales('2026-11-19', 0)); // Keep genuine zero quarter-hours on open days.
  for (const holidayRows of [[], [sales('2026-11-26', 0)]]) {
    const result = unusableDemandDates([...priorWeek, ...otherDays, ...holidayRows], ['2026-11-16', '2026-11-23'], openDays, []);
    assert.deepEqual([...result.excludedDates], ['2026-11-26']);
    assert.deepEqual([...result.excludedWeekEnds], ['2026-11-29']);
  }
});

test('weeks with no sales file remain available unless a full-day closure is recorded', () => {
  const events = [
    { start_date: '2026-11-26', end_date: '2026-11-26', all_day: true, impact_mode: 'manual', sales_lift_percent: -100 },
    { start_date: '2026-11-27', end_date: '2026-11-27', all_day: false, start_time: '20:00', end_time: '23:00', impact_mode: 'manual', sales_lift_percent: -100 },
  ];
  const result = unusableDemandDates([], ['2026-11-16', '2026-11-23'], new Set([3, 4]), events);
  assert.deepEqual([...result.excludedDates], ['2026-11-26']);
  assert.deepEqual([...result.excludedWeekEnds], ['2026-11-29']);
});
