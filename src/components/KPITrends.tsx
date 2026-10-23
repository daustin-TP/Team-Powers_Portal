import { useState } from 'react';
import { rankingMetrics, metricValue, type RankingKey } from '../../supabase/functions/kpi-dashboard/analytics';
type Row={store_id:string;week_end:string;metrics:Record<string,unknown>};
type Store={id:string;name:string;store_number:string|null};
export function kpiDisplay(value:number|null,key:RankingKey) {
 if(value===null)return 'No data';
 const m=rankingMetrics.find(m=>m.key===key)!;
 return m.format==='percent'?`${(value*100).toFixed(2)}%`:m.format==='currency'?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(value):`${value.toFixed(2)} min`;
}
const colors=['#245bb7','#b5412b','#178054','#9648b0','#a56d08','#008393','#da427c','#595ccd','#587e12','#865e4a','#226775','#725e96'];
export default function KPITrends({history,stores}:{history:Row[];stores:Store[]}) {
 const [metric,setMetric]=useState<RankingKey>('sales');
 const [selection,setSelection]=useState<string[]|null>(null);
 const [range,setRange]=useState(12);
 const selected=stores.filter(s=>selection===null||selection.includes(s.id));
 const allWeeks=[...new Set(history.map(r=>r.week_end))].sort().slice(-range);
 const values=selected.flatMap(s=>allWeeks.map(w=>metricValue(history.find(r=>r.store_id===s.id&&r.week_end===w)?.metrics??{},metric))).filter((n):n is number=>n!==null);
 const min=values.length?Math.min(...values):0,max=values.length?Math.max(...values):1;
 const pad=Math.max((max-min)*.12,Math.abs(max)*.03,.01),low=min-pad,high=max+pad;
 const x=(i:number)=>85+i*780/Math.max(1,allWeeks.length-1),y=(v:number)=>280-(v-low)/(high-low)*240;
 return <section className="panel kpi-workspace"><div className="table-toolbar"><div><p className="eyebrow">Progress over time</p><h2>KPI trends</h2><p>Compare stores across the last 12 reported weeks through the selected results week. Gaps mean no reported data.</p></div></div>
 <div className="kpi-plan-controls"><label>KPI<select value={metric} onChange={e=>setMetric(e.target.value as RankingKey)}>{rankingMetrics.map(m=><option key={m.key} value={m.key}>{m.label}</option>)}</select></label><label>Weeks<select value={range} onChange={e=>setRange(Number(e.target.value))}><option value={4}>4 weeks</option><option value={8}>8 weeks</option><option value={12}>12 weeks</option></select></label><button className="button secondary" onClick={()=>setSelection(null)}>All stores</button><button className="button secondary" onClick={()=>setSelection([])}>Clear stores</button></div>
 <fieldset className="kpi-store-picker"><legend>Stores to compare</legend>{stores.map((s,i)=><label key={s.id}><input type="checkbox" checked={selection===null||selection.includes(s.id)} onChange={e=>setSelection(e.target.checked?[...(selection??stores.map(s=>s.id)),s.id]:(selection??stores.map(s=>s.id)).filter(id=>id!==s.id))}/><span style={{color:colors[i%colors.length]}}>●</span>{s.name} {s.store_number}</label>)}</fieldset>
 {!values.length?<p className="empty-card">Select stores with reported results to see a trend.</p>:<><div className="kpi-chart"><svg viewBox="0 0 920 330" role="img" aria-label={`${rankingMetrics.find(m=>m.key===metric)?.label} trends for ${selected.length} stores. Exact values are in the table below.`}>
 {[0,1,2,3,4].map(i=>{const v=low+(high-low)*i/4;return <g key={i}><line x1="85" x2="865" y1={y(v)} y2={y(v)} stroke="#dbe3ee"/><text x="78" y={y(v)+4} textAnchor="end" fontSize="11">{kpiDisplay(v,metric)}</text></g>;})}
 {allWeeks.map((w,i)=><text key={w} x={x(i)} y="307" textAnchor="middle" fontSize="11">{w.slice(5)}</text>)}
 {selected.map(s=>{const color=colors[stores.findIndex(t=>t.id===s.id)%colors.length];let previous:{x:number;y:number}|null=null;return <g key={s.id}>{allWeeks.map((w,i)=>{const value=metricValue(history.find(r=>r.store_id===s.id&&r.week_end===w)?.metrics??{},metric);if(value===null){previous=null;return null;}const point={x:x(i),y:y(value)},last=previous;previous=point;return <g key={w}>{last&&<line x1={last.x} y1={last.y} x2={point.x} y2={point.y} stroke={color} strokeWidth="2"/>}<circle cx={point.x} cy={point.y} r="4" fill={color}><title>{s.name}: {w} — {kpiDisplay(value,metric)}</title></circle></g>;})}</g>;})}
 </svg></div><details><summary>View exact weekly values</summary><div className="responsive-table"><table><thead><tr><th>Week ending</th>{selected.map(s=><th key={s.id}>{s.name}</th>)}</tr></thead><tbody>{allWeeks.map(w=><tr key={w}><th>{w}</th>{selected.map(s=><td key={s.id}>{kpiDisplay(metricValue(history.find(r=>r.store_id===s.id&&r.week_end===w)?.metrics??{},metric),metric)}</td>)}</tr>)}</tbody></table></div></details></>}
 </section>;
}
