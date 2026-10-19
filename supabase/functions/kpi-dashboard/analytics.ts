export const rankingMetrics = [
  { key: 'sales', label: 'Sales', source: 'royalty_sales', lower: false, format: 'currency' },
  { key: 'pcya', label: 'Sales PCYA', source: 'yoy_sales_percent', lower: false, format: 'percent' },
  { key: 'labor', label: 'Labor', source: 'labor_percent', lower: true, format: 'percent' },
  { key: 'splh', label: 'SPLH', source: 'splh', lower: false, format: 'currency' },
  { key: 'food', label: 'Food variance', source: 'food_difference_percent', lower: true, format: 'percent' },
  { key: 'load', label: 'Load', source: 'avg_load', lower: true, format: 'minutes' },
  { key: 'adt', label: 'ADT', source: 'avg_adt', lower: true, format: 'minutes' },
] as const;
export type RankingKey = typeof rankingMetrics[number]['key'];
export type Result = { store_id: string; metrics: Record<string, unknown> };
export type Store = { id: string; name: string; store_number: string | null };
export type RankValue = { value: number | null; rank: number | null; eligible: number; tied: boolean };
export type StoreRanking = { store_id: string; store: string; name: string; metrics: Record<RankingKey, RankValue> };

export function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  const text = String(value).trim();
  if (!text || /^(n\/?a|pending|—|-)$/i.test(text)) return null;
  const parsed = Number(text.replace(/[$,%\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}
function percentValue(value: unknown) {
  const n = numberValue(value);
  return n !== null && typeof value === 'string' && value.includes('%') ? n / 100 : n;
}
export function metricValue(metrics: Record<string, unknown>, key: RankingKey) {
  if (key === 'pcya') {
    const previous = numberValue(metrics.sales_last_year);
    const sales = numberValue(metrics.royalty_sales);
    // A zero/missing comparison base must not turn a new store into a 0% comp.
    return previous !== null && previous > 0 && sales !== null ? (sales - previous) / previous : null;
  }
  const definition = rankingMetrics.find((item) => item.key === key)!;
  return definition.format === 'percent' ? percentValue(metrics[definition.source]) : numberValue(metrics[definition.source]);
}
export function rankStores(stores: Store[], results: Result[]): StoreRanking[] {
  const byId = new Map(results.map((row) => [row.store_id, row.metrics]));
  const rows = stores.map((store) => ({ store_id: store.id, store: store.store_number || store.name, name: store.name,
    metrics: Object.fromEntries(rankingMetrics.map((metric) => [metric.key, { value: metricValue(byId.get(store.id) ?? {}, metric.key), rank: null, eligible: 0, tied: false }])) as Record<RankingKey, RankValue>,
  }));
  for (const metric of rankingMetrics) {
    const eligible = rows.filter((row) => row.metrics[metric.key].value !== null);
    for (const row of rows) {
      const entry = row.metrics[metric.key];
      entry.eligible = eligible.length;
      if (entry.value === null) continue;
      // Rank at the displayed precision so identical displayed results tie.
      const precision = metric.format === 'percent' ? 10000 : 100;
      const value = Math.round(entry.value * precision);
      const compare = (other: StoreRanking) => Math.round(other.metrics[metric.key].value! * precision);
      entry.rank = 1 + eligible.filter((other) => metric.lower ? compare(other) < value : compare(other) > value).length;
      entry.tied = eligible.filter((other) => compare(other) === value).length > 1;
    }
  }
  return rows;
}
export function summarizeGroup(results: Result[]) {
  const values = (key: RankingKey) => results.map((row) => metricValue(row.metrics, key)).filter((n): n is number => n !== null);
  const average = (key: RankingKey) => { const data = values(key); return data.length ? data.reduce((a, b) => a + b, 0) / data.length : null; };
  const sales = values('sales');
  const comparable = results.filter((row) => metricValue(row.metrics, 'pcya') !== null);
  const priorSales = comparable.reduce((sum, row) => sum + numberValue(row.metrics.sales_last_year)!, 0);
  const compSales = comparable.reduce((sum, row) => sum + numberValue(row.metrics.royalty_sales)!, 0);
  return {
    values: { sales: sales.length ? sales.reduce((a, b) => a + b, 0) : null, pcya: priorSales > 0 ? (compSales - priorSales) / priorSales : null,
      labor: average('labor'), splh: average('splh'), food: average('food'), load: average('load'), adt: average('adt') },
    counts: Object.fromEntries(rankingMetrics.map((metric) => [metric.key, values(metric.key).length])) as Record<RankingKey, number>,
  };
}
export function dashboardAccess(profile: { id: string; role: string; active: boolean; store_id: string | null }, permissions: string[], assignments: { profile_id: string; store_id: string }[]) {
  const canView = profile.active && (['admin', 'supervisor'].includes(profile.role) || permissions.some((p) => ['kpi_view', 'kpi_view_all'].includes(p)));
  const canViewAll = canView && (['admin', 'supervisor'].includes(profile.role) || permissions.includes('kpi_view_all'));
  const assigned = new Set(assignments.filter((a) => a.profile_id === profile.id).map((a) => a.store_id));
  if (profile.store_id) assigned.add(profile.store_id);
  return { canView, canViewAll, canEdit: canView && (['admin', 'supervisor'].includes(profile.role) || permissions.includes('kpi_edit_goals')), assigned };
}
