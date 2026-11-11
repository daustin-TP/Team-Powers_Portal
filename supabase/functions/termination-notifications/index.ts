import { createClient } from "npm:@supabase/supabase-js@2.110.9";
import { emailConfig, sendEmailMessage } from "../payroll/email.ts";
import { terminationEmailCopy, uniqueEmails } from "./model.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Sign in required" }, 401);
    const auth = await db.auth.getUser(token);
    if (auth.error || !auth.data.user) return json({ error: "Sign in required" }, 401);
    const body = await req.json();
    const actionId = String(body.action_id ?? "");
    const memberId = String(body.member_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(actionId) || !/^[0-9a-f-]{36}$/i.test(memberId)) return json({ error: "Invalid termination record" }, 400);

    const [profileResult, actionResult, memberResult, settingsResult] = await Promise.all([
      db.from("profiles").select("id,role,active,full_name,store_id").eq("id", auth.data.user.id).maybeSingle(),
      db.from("hr_disciplinary_actions").select("id,store_id,member_id,employee_name,incident_date,incident_summary,action_type,submitted_by,submitted_by_name").eq("id", actionId).maybeSingle(),
      db.from("labor_team_members").select("id,store_id,display_name").eq("id", memberId).maybeSingle(),
      db.from("hr_notification_settings").select("delivery_mode,test_recipients,live_recipients").eq("id", true).maybeSingle(),
    ]);
    const profile = profileResult.data as any;
    const action = actionResult.data as any;
    const member = memberResult.data as any;
    if (!profile?.active || !["manager", "supervisor", "admin"].includes(profile.role)) return json({ error: "Access denied" }, 403);
    if (!action || !member || action.action_type !== "termination" || action.store_id !== member.store_id || (action.member_id && action.member_id !== member.id)) return json({ error: "Termination record does not match the roster member" }, 400);
    if (profile.role === "manager" && action.submitted_by !== profile.id) return json({ error: "Managers may only finalize their own termination reports" }, 403);

    if (profile.role !== "admin" && profile.store_id !== member.store_id) {
      const assignment = await db.from("profile_store_assignments").select("store_id").eq("profile_id", profile.id).eq("store_id", member.store_id).maybeSingle();
      if (assignment.error || !assignment.data) return json({ error: "Store access denied" }, 403);
    }

    const updateResult = await db.from("labor_team_members").update({
      employment_status: "terminated",
      active: false,
      status_reason: action.incident_summary,
      status_effective_date: action.incident_date,
      status_notes: "Termination recorded through HR Action Logs.",
      linked_hr_action_id: action.id,
      status_changed_by: profile.id,
      status_changed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", member.id);
    if (updateResult.error) throw new Error("The HR report was saved, but the roster status could not be updated.");

    const storeResult = await db.from("stores").select("name,store_number").eq("id", member.store_id).maybeSingle();
    const settings = settingsResult.data as any;
    const deliveryMode = settings?.delivery_mode === "live" ? "live" : "test";
    const recipients = uniqueEmails(deliveryMode === "live" ? (settings?.live_recipients ?? []) : (settings?.test_recipients ?? []));
    if (!recipients.length) return json({ ok: true, roster_updated: true, sent: 0, warning: "No HR notification recipients are configured." });
    const email = emailConfig();
    if (!email) return json({ ok: true, roster_updated: true, sent: 0, warning: "The termination was recorded, but the DASH email sender is not configured." });
    const store = storeResult.data as any;
    const storeName = store ? `${store.name}${store.store_number ? ` ${store.store_number}` : ""}` : "Store";
    const portalUrl = `${Deno.env.get("DASH_OS_URL")?.trim() || "https://team-powers-portal.daustin-15d.workers.dev/"}?section=hr&record=${action.id}`;
    const copy = terminationEmailCopy({ employeeName: member.display_name, storeName, effectiveDate: action.incident_date, reason: action.incident_summary, submittedBy: action.submitted_by_name, portalUrl, testMode: deliveryMode === "test" });

    let sent = 0, failed = 0;
    for (const recipient of recipients) {
      const logResult = await db.from("hr_termination_notifications").insert({ action_id: action.id, member_id: member.id, recipient_email: recipient, delivery_mode: deliveryMode, status: "sending" }).select("id").maybeSingle();
      if (logResult.error?.code === "23505") continue;
      if (logResult.error || !logResult.data) throw new Error("Termination delivery could not be recorded.");
      try {
        const providerId = await sendEmailMessage(email, { id: logResult.data.id, to: recipient, subject: copy.subject, text: copy.text, html: copy.html, fromName: "DASH-OS Human Resources" });
        await db.from("hr_termination_notifications").update({ status: "sent", sent_at: new Date().toISOString(), provider_id: providerId }).eq("id", logResult.data.id);
        sent += 1;
      } catch (error) {
        await db.from("hr_termination_notifications").update({ status: "failed", last_error: error instanceof Error ? error.message : "Email delivery failed" }).eq("id", logResult.data.id);
        failed += 1;
      }
    }
    return json({ ok: failed === 0, roster_updated: true, delivery_mode: deliveryMode, sent, failed, ...(failed ? { warning: "The termination was recorded, but one or more test emails failed." } : {}) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Termination processing failed" }, 400);
  }
});
