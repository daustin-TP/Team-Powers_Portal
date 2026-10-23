import { metricValue, rankingMetrics, summarizeGroup, type Result, type Store, type RankingKey } from './analytics.ts';
export type Action = { id:string; store_id:string; metric:RankingKey; note:string; action:string; owner:string; due_date:string; status:'open'|'in_progress'|'done'; outcome:string };
export type Snapshot = ReturnType<typeof regionSnapshot>;
export function regionSnapshot(stores:Store[], results:Result[], goals: {store_id:string;goals:Record<string,unknown>}[]) {
  const rows = stores.map(store => ({ ...store, metrics: Object.fromEntries(rankingMetrics.map(metric => {
    const value = metricValue(results.find(r=>r.store_id===store.id)?.metrics ?? {},metric.key);
    const key = metric.key === 'food' ? 'food_variance' : metric.key;
    const rawGoal = goals.find(g=>g.store_id===store.id)?.goals[key];
    const goal = typeof rawGoal==='number' && Number.isFinite(rawGoal) ? rawGoal : null;
    const peers = results.map(r=>metricValue(r.metrics,metric.key)).filter((v):v is number=>v!==null);
    const mean = peers.length ? peers.reduce((a,b)=>a+b,0)/peers.length : null;
    const deviation = mean===null ? 0 : Math.sqrt(peers.reduce((s,v)=>s+(v-mean)**2,0)/peers.length);
    const outlier = value!==null && mean!==null && peers.length>=4 && deviation>0 && (metric.lower?value-mean:mean-value)>1.5*deviation;
    return [metric.key,{value,goal,missed:value!==null&&goal!==null&&(metric.lower?value>goal:value<goal),outlier}];
  })) as Record<RankingKey,{value:number|null;goal:number|null;missed:boolean;outlier:boolean}> }));
  return {stores:rows,summary:summarizeGroup(results),created_at:new Date().toISOString()};
}
export function suggestedActions(snapshot:Snapshot,due:string):Action[] {
  const suggestions:Record<RankingKey,string>={sales:'Review sales by day and build a local sales plan.',pcya:'Review comparable sales trends and customer retention.',labor:'Review staffing by daypart against demand.',splh:'Review peak-hour productivity and shift deployment.',food:'Review counts, waste, portions, and ordering.',load:'Observe peak-hour make-line flow and coach bottlenecks.',adt:'Review dispatch, driver coverage, and late deliveries.'};
  return snapshot.stores.flatMap(store=>rankingMetrics.filter(m=>store.metrics[m.key].missed||store.metrics[m.key].outlier).map(m=>({id:`${store.id}:${m.key}`,store_id:store.id,metric:m.key,note:'',action:suggestions[m.key],owner:'',due_date:due,status:'open' as const,outcome:''})));
}
export function validateActions(value:unknown, storeIds:Set<string>): value is Action[] {
  if (!Array.isArray(value)||value.length>150) return false;
  const ids=new Set<string>();
  return value.every(a=>a && typeof a.id==='string' && a.id.length<=100 && !ids.has(a.id) && !!ids.add(a.id) && storeIds.has(a.store_id) && rankingMetrics.some(m=>m.key===a.metric) && ['open','in_progress','done'].includes(a.status) && ['note','action','owner','outcome'].every(k=>typeof a[k]==='string'&&a[k].length<=4000) && /^\d{4}-\d{2}-\d{2}$/.test(a.due_date) && Number.isFinite(Date.parse(a.due_date)) && new Date(a.due_date).toISOString().slice(0,10)===a.due_date);
}
