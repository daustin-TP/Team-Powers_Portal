import { metricValue, rankingMetrics, summarizeGroup, type Result, type Store, type RankingKey } from './analytics.ts';
export type Action = { id:string; store_id:string; metric:RankingKey; note:string; action:string; owner:string; due_date:string; status:'open'|'in_progress'|'done'; outcome:string };
export const rallyMetricKeys:RankingKey[]=['pcya','labor','splh','food','load','adt'];
export type RallyMetricScore={value:number|null;points:number|null;rank:number|null;eligible:number};
export type RallyStoreScore={store_id:string;name:string;score:number;change:number;opportunity:RankingKey;metrics:Record<RankingKey,RallyMetricScore>};
export type RallyAnalysis={window_weeks:string[];previous_weeks:string[];stores:RallyStoreScore[];focus:RallyStoreScore|null;slipping:RallyStoreScore[];improving:RallyStoreScore[];leaders:RallyStoreScore[]};

const mean=(values:number[])=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
function scoredWindow(stores:Store[],history:(Result&{week_end?:string})[],weeks:string[]) {
 const values=new Map<string,Partial<Record<RankingKey,number>>>();
 for(const store of stores){
  const rows=history.filter(row=>row.store_id===store.id&&row.week_end&&weeks.includes(row.week_end));
  const metrics:Partial<Record<RankingKey,number>>={};
  for(const key of rallyMetricKeys){const measured=rows.map(row=>metricValue(row.metrics,key)).filter((value):value is number=>value!==null);const value=mean(measured);if(value!==null)metrics[key]=key==='food'?Math.abs(value):value;}
  values.set(store.id,metrics);
 }
 const points=new Map<string,Partial<Record<RankingKey,RallyMetricScore>>>();
 for(const key of rallyMetricKeys){
  const definition=rankingMetrics.find(metric=>metric.key===key)!;
  const eligible=stores.map(store=>({id:store.id,value:values.get(store.id)?.[key]})).filter((entry):entry is {id:string;value:number}=>entry.value!==undefined).sort((a,b)=>definition.lower?b.value-a.value:a.value-b.value);
  eligible.forEach((entry,index)=>{const current=points.get(entry.id)??{};current[key]={value:entry.value,points:eligible.length===1?100:index/(eligible.length-1)*100,rank:eligible.length-index,eligible:eligible.length};points.set(entry.id,current);});
 }
 return new Map(stores.flatMap(store=>{const entries=Object.entries(points.get(store.id)??{}) as [RankingKey,RallyMetricScore][];if(entries.length<4)return[];const opportunity=[...entries].sort((a,b)=>(a[1].points??0)-(b[1].points??0))[0][0];const metrics=Object.fromEntries(rallyMetricKeys.map(key=>[key,points.get(store.id)?.[key]??{value:null,points:null,rank:null,eligible:0}])) as Record<RankingKey,RallyMetricScore>;return[[store.id,{store_id:store.id,name:store.name,score:mean(entries.map(([,entry])=>entry.points!))!,opportunity,metrics}]];}));
}
export function rallyAnalysis(stores:Store[],history:(Result&{week_end?:string})[],weekEnd:string):RallyAnalysis {
 const weeks=[...new Set(history.map(row=>row.week_end).filter((week):week is string=>!!week&&week<=weekEnd))].sort();
 const currentWeeks=weeks.slice(-2),previousWeeks=weeks.slice(-4,-2);
 const current=scoredWindow(stores,history,currentWeeks),previous=scoredWindow(stores,history,previousWeeks);
 const scored=stores.flatMap(store=>{const now=current.get(store.id);if(!now)return[];return[{...now,change:now.score-(previous.get(store.id)?.score??now.score)}];}).sort((a,b)=>b.score-a.score);
 return {window_weeks:currentWeeks,previous_weeks:previousWeeks,stores:scored,focus:scored.at(-1)??null,slipping:scored.filter(store=>store.change<=-5),improving:scored.filter(store=>store.change>=5).sort((a,b)=>b.change-a.change),leaders:scored.slice(0,Math.min(2,scored.length))};
}
export type Snapshot = ReturnType<typeof regionSnapshot>;
export function regionSnapshot(stores:Store[], results:Result[], goals: {store_id:string;goals:Record<string,unknown>}[], history:(Result&{week_end?:string})[]=results, weekEnd='9999-12-31') {
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
  return {stores:rows,summary:summarizeGroup(results),rally:rallyAnalysis(stores,history,weekEnd),created_at:new Date().toISOString()};
}
export function suggestedActions(snapshot:Snapshot,due:string):Action[] {
  const suggestions:Record<RankingKey,string>={sales:'Review sales by day and build a local sales plan.',pcya:'Review comparable sales trends and customer retention.',labor:'Review staffing by daypart against demand.',splh:'Review peak-hour productivity and shift deployment.',food:'Review counts, waste, portions, and ordering.',load:'Observe peak-hour make-line flow and coach bottlenecks.',adt:'Review dispatch, driver coverage, and late deliveries.'};
  if(snapshot.rally?.focus){
   const attention=[snapshot.rally.focus,...snapshot.rally.slipping.filter(store=>store.store_id!==snapshot.rally.focus?.store_id)];
   return attention.map((rallyStore,index)=>({id:`${rallyStore.store_id}:${rallyStore.opportunity}:rally`,store_id:rallyStore.store_id,metric:rallyStore.opportunity,note:index===0?'Primary regional focus: lowest overall Rally score.':`Slipping: Rally score moved ${rallyStore.change.toFixed(1)} points in the wrong direction.`,action:suggestions[rallyStore.opportunity],owner:'',due_date:due,status:'open' as const,outcome:''}));
  }
  return snapshot.stores.flatMap(store=>rankingMetrics.filter(m=>store.metrics[m.key].missed||store.metrics[m.key].outlier).map(m=>({id:`${store.id}:${m.key}`,store_id:store.id,metric:m.key,note:'',action:suggestions[m.key],owner:'',due_date:due,status:'open' as const,outcome:''})));
}
export function validateActions(value:unknown, storeIds:Set<string>): value is Action[] {
  if (!Array.isArray(value)||value.length>150) return false;
  const ids=new Set<string>();
  return value.every(a=>a && typeof a.id==='string' && a.id.length<=100 && !ids.has(a.id) && !!ids.add(a.id) && storeIds.has(a.store_id) && rankingMetrics.some(m=>m.key===a.metric) && ['open','in_progress','done'].includes(a.status) && ['note','action','owner','outcome'].every(k=>typeof a[k]==='string'&&a[k].length<=4000) && /^\d{4}-\d{2}-\d{2}$/.test(a.due_date) && Number.isFinite(Date.parse(a.due_date)) && new Date(a.due_date).toISOString().slice(0,10)===a.due_date);
}
