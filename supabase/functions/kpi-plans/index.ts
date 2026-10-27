import { createClient } from 'npm:@supabase/supabase-js@2.110.9';
import { isIndividualStore } from '../kpi-dashboard/analytics.ts';
import { automaticGoals, addDays, planningWeek } from '../kpi-dashboard/goals.ts';
import { regionSnapshot, suggestedActions, validateActions } from '../kpi-dashboard/planning.ts';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
export async function handlePlans(req:Request) {
 if(req.method==='OPTIONS') return new Response('ok',{headers});
 if(req.method!=='POST') return json({error:'Method not allowed'},405);
 try {
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const {data:auth,error:authError}=await db.auth.getUser((req.headers.get('Authorization')??'').replace(/^Bearer\s+/i,''));
  if(authError||!auth.user) return json({error:'Sign in required.'},401);
  const {data:profile,error:profileError}=await db.from('profiles').select('id,role,active').eq('id',auth.user.id).single();
  if(profileError||!profile?.active||!['admin','supervisor'].includes(profile.role)) return json({error:'Leadership access required.'},403);
  const admin=profile.role==='admin';
  const body=await req.json();
  if(body.action==='list') {
   let q=db.from('kpi_regional_plans').select('*').order('week_end',{ascending:false}).limit(100);
   if(!admin) q=q.eq('supervisor_id',profile.id).in('status',['released','closed']);
   const [plans,reviewers]=await Promise.all([q,admin?db.from('profiles').select('id,full_name').eq('role','admin').eq('active',true):Promise.resolve({data:[],error:null})]);
   if(plans.error||reviewers.error) throw plans.error||reviewers.error;
   return json({ok:true,plans:plans.data,reviewers:reviewers.data});
  }
  if(body.action==='create') {
   if(!admin) return json({error:'Only admin can create regional reports.'},403);
   const week=body.week_end;
   if(typeof week!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(week)||!Number.isFinite(Date.parse(week))||new Date(week).toISOString().slice(0,10)!==week||new Date(week).getUTCDay()!==0||week>=planningWeek()) return json({error:'Choose a completed Sunday.'},400);
   const supervisor=await db.from('profiles').select('id,full_name,store_id').eq('id',body.supervisor_id).eq('role','supervisor').eq('active',true).single();
   if(supervisor.error||!supervisor.data) return json({error:'Select an active District Manager.'},400);
   const assignments=await db.from('profile_store_assignments').select('store_id').eq('profile_id',body.supervisor_id);
   if(assignments.error) throw assignments.error;
   const ids=[...new Set([supervisor.data.store_id,...(assignments.data??[]).map(a=>a.store_id)].filter(Boolean))];
   if(!ids.length) return json({error:'Assign stores to this District Manager first.'},400);
   const responses=await Promise.all([
    db.from('stores').select('id,name,store_number').in('id',ids).eq('active',true),
    db.from('kpi_weekly_results').select('store_id,week_end,metrics').in('store_id',ids).gte('week_end',addDays(week,-77)).lte('week_end',week),
    db.from('kpi_goal_commitments').select('store_id,goals').in('store_id',ids).eq('week_end',week),
    db.from('kpi_automatic_goals').select('store_id,goals').in('store_id',ids).eq('week_end',week),
   ]);
   for(const r of responses) if(r.error) throw r.error;
   const [stores,history,goals,autos]=responses.map(r=>r.data??[]);
   const individual=stores.filter(isIndividualStore);
   const results=history.filter(r=>r.week_end===week && individual.some(s=>s.id===r.store_id));
   if(!results.length) return json({error:'No results have arrived for this region and week.'},400);
   const effective=individual.map(store=>{const defaults=autos.find(a=>a.store_id===store.id)?.goals??automaticGoals(history.filter(r=>r.store_id===store.id),week);const overrides=goals.find(g=>g.store_id===store.id)?.goals??{};return {store_id:store.id,goals:{...defaults,...Object.fromEntries(Object.entries(overrides).filter(([,v])=>v!==null))}};});
   const snapshot={...regionSnapshot(individual,results,effective),supervisor_name:supervisor.data.full_name,week_end:week};
   const due=addDays(week,body.followup_weeks===2?15:8);
   const {data,error}=await db.from('kpi_regional_plans').insert({supervisor_id:body.supervisor_id,week_end:week,followup_date:due,snapshot,actions:suggestedActions(snapshot,due),created_by:profile.id,updated_by:profile.id}).select().single();
   if(error?.code==='23505') return json({error:'This region already has a report for that week. Open the existing report.'},409);
   if(error) throw error;
   return json({ok:true,plan:data});
  }
  const existing=await db.from('kpi_regional_plans').select('*').eq('id',body.id).single();
  if(existing.error||!existing.data) return json({error:'Report not found.'},404);
  const plan=existing.data;
  if(!admin&&(plan.supervisor_id!==profile.id||!['released','closed'].includes(plan.status))) return json({error:'Report not available.'},403);
  if(body.action==='results') {
   const result=await db.from('kpi_weekly_results').select('store_id,week_end,metrics').in('store_id',plan.snapshot.stores.map(s=>s.id)).gt('week_end',plan.week_end).lte('week_end',addDays(plan.followup_date,6)).order('week_end');
   if(result.error) throw result.error;
   return json({ok:true,results:result.data});
  }
  if(body.action!=='save'||plan.status==='closed') return json({error:'This report cannot be changed.'},400);
  const actions=body.actions;
  if(!validateActions(actions,new Set(plan.snapshot.stores.map(s=>s.id)))) return json({error:'Check the action dates, stores, and text lengths.'},400);
  const patch:Record<string,unknown>={updated_by:profile.id,updated_at:new Date().toISOString(),version:plan.version+1};
  if(['draft','director_review'].includes(plan.status)) {
   if(!admin) return json({error:'Admin review required.'},403);
   if(!['draft','director_review','released'].includes(body.status)) return json({error:'Invalid review stage.'},400);
   if(body.status==='released'&&(plan.status!=='director_review'||plan.reviewer_id!==profile.id||body.reviewer_id!==plan.reviewer_id)) return json({error:'The assigned Director reviewer must review and release this report.'},403);
   if(body.reviewer_id) {const reviewer=await db.from('profiles').select('id').eq('id',body.reviewer_id).eq('role','admin').eq('active',true).single();if(reviewer.error) return json({error:'Select an active admin as Director reviewer.'},400);}
   if(body.status!=='draft'&&!body.reviewer_id) return json({error:'Assign the Director reviewer first.'},400);
   if(body.status==='released'&&actions.some(a=>!a.owner.trim()||!a.action.trim())) return json({error:'Every action needs an owner and an action before release.'},400);
   for(const key of ['admin_notes','director_notes']) {if(typeof body[key]!=='string'||body[key].length>12000) return json({error:'Notes are too long.'},400);patch[key]=body[key];}
   Object.assign(patch,{actions,status:body.status,reviewer_id:body.reviewer_id||null});
   if(body.status==='released') patch.released_at=new Date().toISOString();
  } else {
   // After release the original instructions are immutable; only progress is editable.
   if(actions.length!==plan.actions.length||actions.some(a=>!plan.actions.some(old=>old.id===a.id))) return json({error:'Released actions cannot be added or removed.'},400);
   patch.actions=plan.actions.map(old=>{const update=actions.find(a=>a.id===old.id)!;return {...old,status:update.status,outcome:update.outcome};});
   if(typeof body.followup_notes!=='string'||body.followup_notes.length>12000) return json({error:'Invalid follow-up notes.'},400);
   patch.followup_notes=body.followup_notes;
   if(body.status==='closed') {if(!admin||actions.some(a=>a.status!=='done')) return json({error:'Admin can close the report after every action is done.'},403);patch.status='closed';}
  }
  const saved=await db.from('kpi_regional_plans').update(patch).eq('id',plan.id).eq('version',body.version).select().maybeSingle();
  if(saved.error) throw saved.error;
  if(!saved.data) return json({error:'Someone updated this report. Reload it before saving your changes.'},409);
  return json({ok:true,plan:saved.data});
 } catch(error) {console.error(error);return json({error:'Could not update regional plans. Please retry.'},500);}
}
Deno.serve(handlePlans);
