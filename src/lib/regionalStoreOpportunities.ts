import { rankingMetrics } from "../../supabase/functions/kpi-dashboard/analytics";
import { rallyAnalysis, type Snapshot } from "../../supabase/functions/kpi-dashboard/planning";

type HistoryRow = { store_id: string; week_end: string; metrics: Record<string, unknown> };

export function regionalStoreOpportunities(snapshot: Snapshot, history: HistoryRow[], weekEnd: string) {
  const rally = snapshot.rally?.stores.length ? snapshot.rally : rallyAnalysis(snapshot.stores, history, weekEnd);
  const scores = new Map(rally.stores.map(store => [store.store_id, store]));
  return snapshot.stores.map(store => {
    const scored = scores.get(store.id);
    const comparable = rankingMetrics.filter(metric => metric.key !== "sales" && store.metrics[metric.key]?.value != null);
    const missed = comparable.flatMap(metric => {
      const result = store.metrics[metric.key];
      if (!result.missed || result.goal == null || result.value == null) return [];
      const gap = Math.abs(result.value - result.goal) / Math.max(Math.abs(result.goal), .01);
      return [{ metric, gap }];
    }).sort((left, right) => right.gap - left.gap);
    const flagged = comparable.find(metric => store.metrics[metric.key]?.outlier);
    const key = scored?.opportunity ?? missed[0]?.metric.key ?? flagged?.key;
    return {
      id: store.id,
      name: store.name,
      number: store.store_number,
      priority: rally.focus?.store_id === store.id,
      score: scored?.score ?? null,
      label: rankingMetrics.find(metric => metric.key === key)?.label
        ?? (comparable.length >= 4 ? "No flagged opportunity" : "Insufficient KPI data"),
      reason: scored ? "Lowest scoring KPI in the Rally"
        : missed.length ? "Largest relative gap to goal" : flagged ? "Regional outlier" : "",
    };
  }).sort((left, right) => Number(right.priority) - Number(left.priority) || (left.score ?? Infinity) - (right.score ?? Infinity) || left.name.localeCompare(right.name));
}
