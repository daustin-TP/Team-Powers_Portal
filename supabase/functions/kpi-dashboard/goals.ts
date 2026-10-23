import { numberValue as numericValue } from './analytics.ts';
export type HistoricalKpiResult = {store_id:string;week_end:string;metrics:Record<string,unknown>};
export function addDays(value: string, days: number) {
  const d = new Date(`${value}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
}
export function planningWeek(now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const day = new Date(`${today}T12:00:00Z`).getUTCDay();
  return addDays(today, day === 0 ? 0 : 7 - day);
}
export function automaticGoals(history: HistoricalKpiResult[], weekEnd: string, forecast?: number) {
  const prior = history.filter(row => row.week_end < weekEnd).sort((a,b) => a.week_end.localeCompare(b.week_end)).map(row=>({...row,metrics:{...row.metrics,...Object.fromEntries(['labor_percent','food_difference_percent'].map(key=>{const value=numericValue(row.metrics[key]);return [key,typeof row.metrics[key]==='string'&&String(row.metrics[key]).includes('%')?(value===null?null:value/100):row.metrics[key]];}))}}));
  const result: Record<string, number | null> = {};
  result.sales = numericValue(roundedGoal(forecast ?? projectedTrajectory(prior, 'royalty_sales'), 100));
  for (const [key, source, lower, step, decimals] of [
    ['labor','labor_percent',true,.002,4], ['splh','splh',false,.25,2],
    ['food_variance','food_difference_percent',true,.001,4], ['load','avg_load',true,.1,2], ['adt','avg_adt',true,.25,2],
  ] as const) result[key] = numericValue(preciseGoal(suggestedGoal(prior, source, projectedTrajectory(prior, source), lower, step), decimals));
  return result;
}
function weightedAverage(values: number[]) {
  if (!values.length) return null;
  const denominator = values.reduce((sum, _value, index) => sum + index + 1, 0);
  return values.reduce((sum, value, index) => sum + value * (index + 1), 0) / denominator;
}

function projectedTrajectory(history: HistoricalKpiResult[], key: string) {
  const values = history
    .map((row) => numericValue(row.metrics[key]))
    .filter((value): value is number => value !== null)
    .slice(-8);
  if (!values.length) return null;
  if (values.length === 1) return values[0];
  const xAverage = (values.length - 1) / 2;
  const yAverage = values.reduce((sum, value) => sum + value, 0) / values.length;
  const numerator = values.reduce((sum, value, index) => sum + (index - xAverage) * (value - yAverage), 0);
  const denominator = values.reduce((sum, _value, index) => sum + ((index - xAverage) ** 2), 0);
  const slope = denominator ? numerator / denominator : 0;
  const recentAverage = weightedAverage(values) ?? values.at(-1)!;
  const predicted = recentAverage + slope * 0.65;
  const range = Math.max(Math.abs(recentAverage) * 0.12, Math.max(...values) - Math.min(...values));
  return Math.max(recentAverage - range, Math.min(recentAverage + range, predicted));
}

function suggestedGoal(history: HistoricalKpiResult[], key: string, trajectory: number | null, lowerIsBetter: boolean, minimumStep: number) {
  if (trajectory === null) return null;
  const values = history
    .map((row) => numericValue(row.metrics[key]))
    .filter((value): value is number => value !== null)
    .slice(-6);
  if (!values.length) return trajectory;
  const recentAverage = weightedAverage(values) ?? trajectory;
  const best = lowerIsBetter ? Math.min(...values) : Math.max(...values);
  const step = Math.max(Math.abs(recentAverage) * 0.01, minimumStep);
  if (lowerIsBetter) {
    const improved = Math.min(trajectory, recentAverage) - step;
    return Math.min(trajectory, Math.max(improved, best * 0.98));
  }
  const improved = Math.max(trajectory, recentAverage) + step;
  return Math.max(trajectory, Math.min(improved, best * 1.02));
}

function roundedGoal(value: number | null, increment: number) {
  if (value === null) return "";
  return String(Math.round(value / increment) * increment);
}

function preciseGoal(value: number | null, decimals: number) {
  if (value === null) return "";
  return String(Number(value.toFixed(decimals)));
}

