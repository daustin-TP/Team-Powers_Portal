import { emailConfig, sendEmailMessage } from '../payroll/email.ts';

const portalUrl = () => Deno.env.get('DASH_OS_URL')?.trim() || 'https://team-powers-portal.daustin-15d.workers.dev/';
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));

export function regionalPlanEmail(plan: any, supervisorName: string) {
  const actions = Array.isArray(plan.actions) ? plan.actions : [];
  const stores = Array.isArray(plan.snapshot?.stores) ? plan.snapshot.stores : [];
  const storeName = (id: string) => stores.find((store: any) => store.id === id)?.name ?? 'Assigned store';
  const actionLines = actions.map((action: any) => `• ${storeName(action.store_id)} — ${action.metric}: ${action.action || 'Review the released plan in DASH-OS'} (due ${action.due_date})`);
  const subject = `[DASH-OS] KPI follow-up assigned — due ${plan.followup_date}`;
  const text = [
    `Hello ${supervisorName},`, '',
    'A new regional KPI plan has been released to you and needs action.',
    `Results week ending: ${plan.week_end}`,
    `Follow-up date: ${plan.followup_date}`,
    `Open actions: ${actions.length}`, '',
    ...actionLines, '',
    `Open DASH-OS: ${portalUrl()}`,
    'Go to KPI Dashboard → Follow-Up to update progress, evidence, and follow-up notes.',
  ].join('\n');
  const actionHtml = actions.map((action: any) => `<li style="margin:0 0 10px"><strong>${escapeHtml(storeName(action.store_id))}</strong> — ${escapeHtml(action.metric)}<br>${escapeHtml(action.action || 'Review the released plan in DASH-OS')}<br><span style="color:#526579">Due ${escapeHtml(action.due_date)}</span></li>`).join('');
  const html = `<div style="font-family:Arial,sans-serif;background:#f3f7fb;padding:24px;color:#102a43"><div style="max-width:680px;margin:auto;background:#fff;border:1px solid #d9e3ed;border-radius:16px;overflow:hidden"><div style="background:#07192d;padding:22px 26px;color:#fff"><div style="font-size:12px;letter-spacing:2px;color:#4bb3fd">DASH-OS KPI FOLLOW-UP</div><h1 style="font-size:24px;margin:8px 0 0">A regional plan needs your action</h1></div><div style="padding:26px"><p>Hello ${escapeHtml(supervisorName)},</p><p>A new regional KPI plan has been released to you.</p><table style="width:100%;border-collapse:collapse;margin:18px 0"><tr><td style="padding:10px;background:#f5f8fb">Results week ending</td><td style="padding:10px;background:#f5f8fb"><strong>${escapeHtml(plan.week_end)}</strong></td></tr><tr><td style="padding:10px">Follow-up date</td><td style="padding:10px"><strong>${escapeHtml(plan.followup_date)}</strong></td></tr></table><h2 style="font-size:18px">Assigned actions</h2><ul style="padding-left:20px">${actionHtml}</ul><p style="margin-top:24px"><a href="${escapeHtml(portalUrl())}" style="display:inline-block;background:#087ec1;color:#fff;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:8px">Open KPI Follow-Up</a></p><p style="color:#526579;font-size:13px">In DASH-OS, open KPI Dashboard → Follow-Up to record progress, evidence, and follow-up notes.</p></div></div></div>`;
  return { subject, text, html };
}

export async function notifyRegionalPlanReleased(db: any, plan: any) {
  const recipient = await db.from('profiles').select('id,email,full_name').eq('id', plan.supervisor_id).eq('active', true).single();
  if (recipient.error || !recipient.data?.email) return { sent: false, error: 'The assigned Area Supervisor does not have an active email address.' };
  const log = await db.from('kpi_regional_plan_notifications').insert({
    plan_id: plan.id, event: 'released', recipient_profile_id: recipient.data.id,
    recipient_email: recipient.data.email, status: 'sending',
  }).select('id').single();
  if (log.error?.code === '23505') return { sent: true, duplicate: true };
  if (log.error) return { sent: false, error: 'The notification could not be queued.' };
  const config = emailConfig();
  if (!config) {
    await db.from('kpi_regional_plan_notifications').update({status:'failed',last_error:'Email sender is not configured.'}).eq('id',log.data.id);
    return { sent: false, error: 'Email sender is not configured.' };
  }
  try {
    const copy = regionalPlanEmail(plan, recipient.data.full_name || 'Area Supervisor');
    const providerId = await sendEmailMessage(config, { id: log.data.id, to: recipient.data.email, ...copy, fromName: 'DASH-OS KPI Follow-Up' });
    await db.from('kpi_regional_plan_notifications').update({status:'sent',provider_id:providerId,sent_at:new Date().toISOString(),last_error:null}).eq('id',log.data.id);
    return { sent: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email delivery failed.';
    await db.from('kpi_regional_plan_notifications').update({status:'failed',last_error:message}).eq('id',log.data.id);
    return { sent: false, error: message };
  }
}
