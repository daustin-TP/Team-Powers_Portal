import { createClient } from "npm:@supabase/supabase-js@2.110.9";
import { emailConfig, emailDeliveryFailure, sendEmailMessage } from "../payroll/email.ts";

const LIVE_DATE = "2026-11-01";
const PORTAL_URL = Deno.env.get("DASH_OS_URL")?.trim() || "https://team-powers-portal.daustin-15d.workers.dev/";
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const iso = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
const addDays = (value: string, days: number) => { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return iso(date); };
const annualDate = (source: string, year: number) => `${year}-${source.slice(5)}`;
const localDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const localHour = () => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const displayDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const typeLabel = (value: string) => value === "90_day" ? "90-day" : value === "30_day_follow_up" ? "30-day follow-up" : value === "annual" ? "Annual" : "Other";

type Member = { id: string; store_id: string; display_name: string };
type Detail = { member_id: string; hire_date: string | null; rehire_date: string | null; evaluation_anniversary: string | null };
type Evaluation = { member_id: string; evaluation_type: string; due_date: string; evaluation_date: string | null; status: string; next_evaluation_type: string | null; next_evaluation_date: string | null };
type Candidate = { member: Member; evaluationType: string; dueDate: string; event: "available" | "past_due"; notificationDate: string };

function candidateFor(member: Member, detail: Detail, evaluations: Evaluation[], today: string): Candidate | null {
  const employmentDate = detail.rehire_date || detail.hire_date;
  const start = detail.evaluation_anniversary || employmentDate;
  if (!start) return null;
  const memberEvaluations = evaluations.filter((item) => item.member_id === member.id);
  const completedNinetyDay = memberEvaluations.some((item) => item.evaluation_type === "90_day" && item.status === "completed");
  const yearsEmployed = Number(today.slice(0, 4)) - Number(start.slice(0, 4));
  let evaluationType = yearsEmployed < 1 && !completedNinetyDay ? "90_day" : "annual";
  let dueDate = evaluationType === "90_day" ? addDays(start, 90) : annualDate(start, Number(today.slice(0, 4)));
  const latestCompleted = memberEvaluations.filter((item) => item.status === "completed").sort((a, b) => (b.evaluation_date || b.due_date).localeCompare(a.evaluation_date || a.due_date))[0];
  if (latestCompleted?.next_evaluation_date) {
    dueDate = latestCompleted.next_evaluation_date;
    evaluationType = latestCompleted.next_evaluation_type === "30_day_follow_up" ? "30_day_follow_up" : "annual";
  } else if (evaluationType === "annual" && dueDate < today && latestCompleted?.evaluation_type === "annual" && (latestCompleted.evaluation_date || latestCompleted.due_date) >= dueDate) {
    dueDate = annualDate(start, Number(today.slice(0, 4)) + 1);
  }
  if (dueDate < LIVE_DATE || memberEvaluations.some((item) => item.due_date === dueDate && item.status === "completed")) return null;
  const availableDate = addDays(dueDate, -14);
  const deadlineDate = addDays(dueDate, 7);
  if (today > deadlineDate) return { member, evaluationType, dueDate, event: "past_due", notificationDate: today };
  if (today >= availableDate) return { member, evaluationType, dueDate, event: "available", notificationDate: availableDate };
  return null;
}

function emailText(name: string, candidates: Candidate[], stores: Map<string, string>) {
  const overdue = candidates.filter((item) => item.event === "past_due");
  const available = candidates.filter((item) => item.event === "available");
  const lines = [`Hello ${name},`, ""];
  if (overdue.length) lines.push("PAST-DUE EVALUATIONS", ...overdue.map((item) => `• ${item.member.display_name} — ${typeLabel(item.evaluationType)} at ${stores.get(item.member.store_id) || "Store"}; was due ${displayDate(addDays(item.dueDate, 7))}`), "");
  if (available.length) lines.push("EVALUATIONS NOW AVAILABLE", ...available.map((item) => `• ${item.member.display_name} — ${typeLabel(item.evaluationType)} at ${stores.get(item.member.store_id) || "Store"}; qualifying ${displayDate(item.dueDate)}, complete by ${displayDate(addDays(item.dueDate, 7))}`), "");
  lines.push("Open Team Evaluations in DASH-OS to complete or continue these reviews.", "", "Available reviews are sent once. Past-due reviews are sent every morning until completed.");
  return lines.join("\n");
}

function emailHtml(title: string, text: string) {
  const body = escapeHtml(text).replaceAll("\n", "<br>");
  return `<!doctype html><html><body style="margin:0;background:#eef3f8;font-family:Arial,Helvetica,sans-serif;color:#10233d"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fff;border:1px solid #dce5ef;border-radius:16px;overflow:hidden"><tr><td style="background:#07111f;padding:24px 28px"><div style="font-size:27px;font-style:italic;font-weight:900"><span style="color:#ff2828">DA</span><span style="color:#168fff">SH</span><span style="color:#fff">os</span></div><div style="color:#a9bbcf;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;margin-top:5px">Team Powers · Evaluations</div></td></tr><tr><td style="padding:28px"><div style="font-size:12px;color:#0878c9;font-weight:800;letter-spacing:.12em;text-transform:uppercase">Manager reminder</div><h1 style="margin:8px 0 22px;font-size:25px;color:#071a33">${escapeHtml(title)}</h1><div style="padding:18px;background:#f8fbfe;border-left:4px solid #168fff;border-radius:4px;color:#263f5c;font-size:14px;line-height:1.65">${body}</div><div style="margin-top:26px"><a href="${escapeHtml(PORTAL_URL)}" style="display:inline-block;background:#0878c9;color:#fff;text-decoration:none;font-size:14px;font-weight:800;padding:12px 20px;border-radius:8px">Open Team Evaluations</a></div></td></tr><tr><td style="background:#f7fafc;border-top:1px solid #e3eaf2;padding:18px 28px;color:#718096;font-size:11px">Sent securely by DASH-OS for Team Powers.</td></tr></table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token || token !== serviceKey) return json({ error: "Not authorized" }, 403);
  const hour = localHour();
  if (hour < 7 || hour >= 11) return json({ ok: true, skipped: "outside_morning_window" });
  const config = emailConfig();
  if (!config) return json({ ok: false, error: "Evaluation email sender is not configured" }, 503);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const today = localDate();
  const [memberResult, detailResult, evaluationResult, storeResult, managerResult, assignmentResult] = await Promise.all([
    db.from("labor_team_members").select("id,store_id,display_name").eq("active", true).in("employment_status", ["active", "borrowed"]),
    db.from("team_member_private_details").select("member_id,hire_date,rehire_date,evaluation_anniversary"),
    db.from("team_evaluations").select("member_id,evaluation_type,due_date,evaluation_date,status,next_evaluation_type,next_evaluation_date"),
    db.from("stores").select("id,name,store_number").eq("active", true),
    db.from("profiles").select("id,full_name,email,store_id").eq("active", true).eq("role", "manager"),
    db.from("profile_store_assignments").select("profile_id,store_id"),
  ]);
  const failure = memberResult.error || detailResult.error || evaluationResult.error || storeResult.error || managerResult.error || assignmentResult.error;
  if (failure) return json({ error: "Evaluation reminder data could not be loaded" }, 500);
  const members = memberResult.data as Member[];
  const details = detailResult.data as Detail[];
  const evaluations = evaluationResult.data as Evaluation[];
  const stores = new Map((storeResult.data || []).map((store) => [store.id, `${store.name}${store.store_number ? ` ${store.store_number}` : ""}`]));
  const candidates = members.flatMap((member) => { const detail = details.find((item) => item.member_id === member.id); const candidate = detail ? candidateFor(member, detail, evaluations, today) : null; return candidate ? [candidate] : []; });
  let sent = 0, skipped = 0, failed = 0;
  for (const manager of managerResult.data || []) {
    if (!manager.email) continue;
    const storeIds = new Set([manager.store_id, ...(assignmentResult.data || []).filter((item) => item.profile_id === manager.id).map((item) => item.store_id)].filter(Boolean));
    const assigned = candidates.filter((item) => storeIds.has(item.member.store_id));
    const pending: Array<Candidate & { notificationId: string }> = [];
    for (const candidate of assigned) {
      const existing = await db.from("team_evaluation_notifications").select("id,status").eq("member_id", candidate.member.id).eq("evaluation_type", candidate.evaluationType).eq("due_date", candidate.dueDate).eq("event", candidate.event).eq("notification_date", candidate.notificationDate).eq("recipient_email", manager.email.toLowerCase()).maybeSingle();
      if (existing.error) { failed++; continue; }
      if (existing.data?.status === "sent" || existing.data?.status === "sending") { skipped++; continue; }
      const payload = { store_id: candidate.member.store_id, member_id: candidate.member.id, evaluation_type: candidate.evaluationType, due_date: candidate.dueDate, event: candidate.event, notification_date: candidate.notificationDate, recipient_profile_id: manager.id, recipient_email: manager.email.toLowerCase(), status: "sending", last_error: null, updated_at: new Date().toISOString() };
      const reserved = existing.data ? await db.from("team_evaluation_notifications").update(payload).eq("id", existing.data.id).select("id").single() : await db.from("team_evaluation_notifications").insert(payload).select("id").single();
      if (reserved.error) { skipped++; continue; }
      pending.push({ ...candidate, notificationId: reserved.data.id });
    }
    if (!pending.length) continue;
    const hasPastDue = pending.some((item) => item.event === "past_due");
    const subject = hasPastDue ? `Evaluation reminder — ${pending.filter((item) => item.event === "past_due").length} past due` : `Team evaluations now available — ${pending.length}`;
    const text = emailText(manager.full_name || "Manager", pending, stores);
    try {
      const providerId = await sendEmailMessage(config, { id: `evaluation-${manager.id}-${today}`, to: manager.email, subject, text, html: emailHtml(subject, text), fromName: "DASH-OS Evaluations" });
      await db.from("team_evaluation_notifications").update({ status: "sent", sent_at: new Date().toISOString(), provider_id: providerId, last_error: null, updated_at: new Date().toISOString() }).in("id", pending.map((item) => item.notificationId));
      sent += pending.length;
    } catch (error) {
      const message = emailDeliveryFailure(error).message;
      await db.from("team_evaluation_notifications").update({ status: "failed", last_error: message, updated_at: new Date().toISOString() }).in("id", pending.map((item) => item.notificationId));
      failed += pending.length;
    }
  }
  return json({ ok: failed === 0, today, candidates: candidates.length, sent, skipped, failed });
});
