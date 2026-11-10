import { jsPDF } from 'jspdf';
import { rankingMetrics, metricValue, type RankingKey } from '../../supabase/functions/kpi-dashboard/analytics';
import type { Action, Snapshot } from '../../supabase/functions/kpi-dashboard/planning';

type ReportPlan = { supervisor_id:string; week_end:string; followup_date:string; status:string; admin_notes:string; director_notes:string; followup_notes:string; actions:Action[]; snapshot:Snapshot & {supervisor_name:string} };
type Result = {store_id:string;week_end:string;metrics:Record<string,unknown>};
type RGB = [number,number,number];
const navy:RGB=[22,43,68], blue:RGB=[30,84,137], ink:RGB=[40,55,71], muted:RGB=[90,105,120], pale:RGB=[241,245,249];
const red:RGB=[157,47,42], redFill:RGB=[255,237,234], amber:RGB=[133,88,12], amberFill:RGB=[255,246,220], green:RGB=[35,104,77], greenFill:RGB=[231,245,237];
const clean=(text:unknown)=>String(text??'').replace(/[\u2010-\u2015]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"').replace(/\u2022/g,'-').replace(/\u2026/g,'...').replace(/[^\x09\x0a\x0d\x20-\xff]/g,'?');
const stage=(text:string)=>text.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());
function value(n:number|null,key:RankingKey) {
 if(n===null||!Number.isFinite(n))return 'No data';
 const m=rankingMetrics.find(m=>m.key===key)!;
 return m.format==='percent'?`${(n*100).toFixed(2)}%`:m.format==='currency'?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n):`${n.toFixed(2)} min`;
}
function change(current:number|null,baseline:number|null,key:RankingKey) {
 if(current===null||baseline===null)return 'No comparison';
 const delta=current-baseline,metric=rankingMetrics.find(m=>m.key===key)!;
 if(Math.abs(delta)<.000001)return 'Unchanged';
 const amount=metric.format==='percent'?`${(Math.abs(delta)*100).toFixed(2)} pts`:value(Math.abs(delta),key);
 return `${delta>0?'+':'-'}${amount} (${(metric.lower?delta<0:delta>0)?'better':'worse'})`;
}

/** Browser download and preview tests use this same layout. No additional data is fetched. */
export function buildRegionalReportPdf(plan:ReportPlan,results:Result[],dirty=false,options:{includeTrends?:boolean;trendWeeks?:4|8|12;history?:Result[]}={}) {
 const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
 const left=15,width=267,bottom=192;
 let y=0,section='Regional overview';
 const text=(s:string,x:number,top:number,size=10,bold=false,color:RGB=ink)=>{pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);pdf.setTextColor(...color);pdf.text(clean(s),x,top);};
 const wrap=(s:string,w:number,size=10)=>{pdf.setFont('helvetica','normal');pdf.setFontSize(size);return pdf.splitTextToSize(clean(s),w) as string[];};
 function heading(continued=false) {
  pdf.setFillColor(...navy);pdf.rect(0,0,297,26,'F');
  text('DASH / TEAM POWERS',left,10,10,true,[184,213,239]);
  text(section+(continued?' / continued':''),left,20,19,true,[255,255,255]);
  text(`${stage(plan.status)}${dirty?' / UNSAVED DRAFT':''}`,210,11,9,true,[255,255,255]);
  text(`Results ${plan.week_end} | Follow-up ${plan.followup_date}`,left,33,10,false,muted);
  y=40;
 }
 function newPage(title=section,continued=true){section=title;pdf.addPage();heading(continued);}
 function room(height:number){if(y+height>bottom)newPage();}
 function title(s:string){room(15);text(s,left,y+5,13,true,blue);y+=11;}
 function paragraph(label:string,body:string,fallback='Not entered') {
  const lines=wrap(body.trim()||fallback,width-10,11);let offset=0;
  do {
   room(24);const count=Math.max(1,Math.floor((bottom-y-13)/5.2));const chunk=lines.slice(offset,offset+count);
   pdf.setFillColor(...pale);pdf.roundedRect(left,y,width,12+chunk.length*5.2,2,2,'F');
   text(label+(offset?' (continued)':''),left+5,y+6,9,true,blue);
   chunk.forEach((line,i)=>text(line,left+5,y+12+i*5.2,11));
   y+=16+chunk.length*5.2;offset+=chunk.length;
   if(offset<lines.length)newPage();
  }while(offset<lines.length);
 }
 type Cell={text:string;fill?:RGB;color?:RGB;bold?:boolean};
 function table(headers:string[],sizes:number[],rows:Cell[][]) {
  function header(){room(18);pdf.setFillColor(...blue);pdf.rect(left,y,width,10,'F');let x=left;headers.forEach((h,i)=>{text(h,x+3,y+6.5,9,true,[255,255,255]);x+=sizes[i];});y+=10;}
  header();
  rows.forEach((row,index)=>{
   const lines=row.map((c,i)=>wrap(c.text,sizes[i]-6,10));const lineCount=Math.max(...lines.map(l=>l.length));let offset=0;
   if(y+Math.min(40,lineCount*4.6+6)>bottom){newPage();header();}
   do {
    const count=Math.min(lineCount-offset,Math.max(1,Math.floor((bottom-y-6)/4.6)));const height=Math.max(11,count*4.6+6);let x=left;
    row.forEach((c,i)=>{pdf.setFillColor(...(c.fill??(index%2===0?[247,249,252]:[255,255,255]) as RGB));pdf.rect(x,y,sizes[i],height,'F');lines[i].slice(offset,offset+count).forEach((line,n)=>text(line,x+3,y+6+n*4.6,10,c.bold??false,c.color??ink));x+=sizes[i];});
    pdf.setDrawColor(218,226,235);pdf.line(left,y+height,left+width,y+height);y+=height;offset+=count;
    if(offset<lineCount){newPage();header();}
   }while(offset<lineCount);
  });y+=7;
 }
 heading();
 text(plan.snapshot.supervisor_name,left,y+6,17,true);y+=14;
 const completed=plan.actions.filter(a=>a.status==='done').length;
 const misses=plan.snapshot.stores.reduce((sum,s)=>sum+rankingMetrics.filter(m=>s.metrics[m.key].missed).length,0);
 text(`${plan.snapshot.stores.length} stores | ${misses} missed KPI goals | ${completed}/${plan.actions.length} actions complete`,left,y,10,false,muted);y+=6;
 const cardWidth=(width-18)/7;
 rankingMetrics.forEach((m,i)=>{const x=left+i*(cardWidth+3);pdf.setFillColor(...pale);pdf.roundedRect(x,y,cardWidth,26,2,2,'F');text(m.label,x+3,y+6,9,true,blue);text(value(plan.snapshot.summary.values[m.key],m.key),x+3,y+14,12,true);text(`${plan.snapshot.summary.counts[m.key]} reporting`,x+3,y+21,8,false,muted);});y+=32;
 text('Sales = region total. PCYA = comparable-store growth. Other KPIs = store averages.',left,y,9,false,muted);y+=7;
 title('Store comparison');
 table(['Store',...rankingMetrics.map(m=>m.label)],[50,...rankingMetrics.map(()=>31)],plan.snapshot.stores.map(s=>[{text:`${s.name}${s.store_number?` / ${s.store_number}`:''}`,bold:true},...rankingMetrics.map(m=>{const v=s.metrics[m.key];return {text:`${value(v.value,m.key)}${v.missed?'\nMissed goal':''}${v.outlier?'\nOutlier':''}`,fill:v.missed?redFill:v.outlier?amberFill:undefined,color:v.missed?red:v.outlier?amber:ink};})]));
 room(14);text('Red: missed goal. Amber: unfavorable regional outlier. Labels remain visible when printed in grayscale.',left,y,9,false,muted);y+=5;text('Missing results are not treated as zero. Store pages show the targets and subsequent results.',left,y,9,false,muted);

 newPage('Leadership priorities',false);
 paragraph('Director of Ops / weekly priorities',plan.director_notes);
 paragraph('Admin context',plan.admin_notes);
 paragraph('Follow-up review',plan.followup_notes,'Review pending');
 title('Action ownership');
 if(!plan.actions.length)paragraph('Action plan','No store actions recorded.');
 else table(['Store / KPI','Owner','Due','Progress'],[117,75,33,42],plan.actions.map(a=>[{text:`${plan.snapshot.stores.find(s=>s.id===a.store_id)?.name??'Store'} / ${rankingMetrics.find(m=>m.key===a.metric)?.label??a.metric}`},{text:a.owner||'Unassigned'},{text:a.due_date},{text:stage(a.status),fill:a.status==='done'?greenFill:pale,color:a.status==='done'?green:ink}]));

 for(const store of plan.snapshot.stores) {
  newPage(`Store plan / ${store.store_number||store.name}`,false);
  text(store.name,left,y+6,17,true);y+=14;
  const later=results.filter(r=>r.store_id===store.id).sort((a,b)=>a.week_end.localeCompare(b.week_end));
  const latest=later.at(-1);
  text(latest?`Baseline ${plan.week_end} | Latest reported results ${latest.week_end}`:`Baseline ${plan.week_end} | Follow-up results pending`,left,y,10,false,muted);y+=7;
  table(['KPI','Baseline actual','Goal','Baseline status','Latest actual','Change from baseline'],[35,40,38,50,40,64],rankingMetrics.map(m=>{const v=store.metrics[m.key],latestValue=latest?metricValue(latest.metrics,m.key):null;return [{text:m.label,bold:true},{text:value(v.value,m.key)},{text:v.goal===null?'Not set':value(v.goal,m.key)},{text:v.value===null?'No result':`${v.missed?'Missed goal':v.goal===null?'No target':'Goal met'}${v.outlier?' / Outlier':''}`,fill:v.missed?redFill:v.outlier?amberFill:v.goal!==null&&v.value!==null?greenFill:pale,color:v.missed?red:v.outlier?amber:ink},{text:value(latestValue,m.key)},{text:change(latestValue,v.value,m.key)}];}));
  const actions=plan.actions.filter(a=>a.store_id===store.id);
  if(options.includeTrends!==false&&actions.length){
   const history=options.history??results;
   const end=[plan.week_end,...history.map(r=>r.week_end)].sort().at(-1)!;
   const weeks=options.trendWeeks??8;
   const dates=Array.from({length:weeks},(_,i)=>{const d=new Date(`${end}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-(weeks-1-i)*7);return d.toISOString().slice(0,10);});
   const metrics=[...new Set(actions.map(a=>a.metric))];
   newPage(`Store trends / ${store.store_number||store.name}`,false);
   text(`${store.name} / ${weeks}-week view`,left,y+5,15,true);y+=13;
   for(const key of metrics){
    room(68);const m=rankingMetrics.find(m=>m.key===key)!;
    const points=dates.map(date=>{const row=history.find(r=>r.store_id===store.id&&r.week_end===date);return row?metricValue(row.metrics,key):date===plan.week_end?store.metrics[key].value:null;});
    const available=points.filter((v):v is number=>v!==null),goal=store.metrics[key].goal;
    text(`${m.label} / ${m.lower?'Lower':'Higher'} is better`,left,y+4,12,true,blue);y+=9;
    if(!available.length){text('No reported data in this window.',left,y+6,11,false,muted);y+=18;continue;}
    const all=goal===null?available:[...available,goal];const low=Math.min(...all),high=Math.max(...all);const pad=Math.max((high-low)*.12,Math.abs(high)*.02,.01),min=low-pad,max=high+pad;
    const chartX=left+36,chartY=y+2,chartW=width-42,chartH=34;
    const px=(i:number)=>chartX+i*chartW/(weeks-1),py=(v:number)=>chartY+chartH-(v-min)/(max-min)*chartH;
    for(let tick=0;tick<3;tick++){const n=min+(max-min)*tick/2;pdf.setDrawColor(217,226,236);pdf.line(chartX,py(n),chartX+chartW,py(n));text(value(n,key),left,py(n)+1,8,false,muted);}
    if(goal!==null){pdf.setDrawColor(...amber);pdf.setLineDashPattern([2,2],0);pdf.line(chartX,py(goal),chartX+chartW,py(goal));pdf.setLineDashPattern([],0);}
    let previous:{x:number;y:number}|null=null;
    points.forEach((v,i)=>{text(dates[i].slice(5),px(i)-4,chartY+chartH+6,8,false,muted);if(v===null){previous=null;return;}const p={x:px(i),y:py(v)};pdf.setDrawColor(...blue);pdf.setLineWidth(.6);if(previous)pdf.line(previous.x,previous.y,p.x,p.y);pdf.setFillColor(...blue);pdf.circle(p.x,p.y,1.1,'F');previous=p;});pdf.setLineWidth(.2);
    y=chartY+chartH+13;text(`Blue: actuals (${available.length}/${weeks} weeks reported). Gaps: missing data.${goal===null?'':' Dashed: original goal '+value(goal,key)+'.'}`,left,y,9,false,muted);y+=10;
   }
   newPage(`Store actions / ${store.store_number||store.name}`,false);
  }
  if(!actions.length)paragraph('Store actions','No actions recorded for this store.');
  actions.forEach((a,index)=>{
   room(35);title(`Action ${index+1} / ${rankingMetrics.find(m=>m.key===a.metric)?.label??a.metric} / ${stage(a.status)}`);
   paragraph(`Owner / due ${a.due_date}`,a.owner,'Unassigned');
   paragraph('What the team needs to do',a.action);
   if(a.note.trim())paragraph('Store-specific notes',a.note);
   paragraph('Outcome / evidence',a.outcome,'Awaiting supervisor update');
   if(later.length)table(['Follow-up week','Actual','Original target','Movement from baseline'],[45,60,60,102],later.map(r=>{const actual=metricValue(r.metrics,a.metric);return [{text:r.week_end},{text:value(actual,a.metric)},{text:value(store.metrics[a.metric].goal,a.metric)},{text:change(actual,store.metrics[a.metric].value,a.metric)}];}));
  });
 }
 newPage('How to read this report',false);
 paragraph('Goals and comparisons','The baseline is the selected completed results week. Its targets stay attached to that week. Later results are compared with that original baseline so the follow-up shows movement, not a new goal. Older weeks without saved targets may use estimates generated from earlier results.');
 paragraph('Regional outliers','An unfavorable outlier is more than 1.5 standard deviations from the region average, with at least four reporting stores. Outliers are signals for review, not proof of a cause. A store can meet its goal and still be an outlier.');
 paragraph('Reading changes','Sales, PCYA, and SPLH improve when higher. Labor, signed food variance, Load, and ADT improve when lower. Percentage changes are shown in percentage points. Missing observations are displayed as No data.');
 const pages=pdf.getNumberOfPages();
 for(let page=1;page<=pages;page++){pdf.setPage(page);pdf.setDrawColor(210,220,230);pdf.line(left,198,282,198);text(`${plan.snapshot.supervisor_name} | ${plan.week_end}${dirty?' | UNSAVED DRAFT':''}`,left,204,8,false,muted);text(`${page} / ${pages}`,268,204,8,false,muted);}
 pdf.setProperties({title:`DASH Regional Report - ${plan.snapshot.supervisor_name} - ${plan.week_end}`,subject:'Regional KPI review and weekly action plan',creator:'DASH'});
 return pdf;
}

