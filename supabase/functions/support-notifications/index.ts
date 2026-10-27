import { createClient } from "npm:@supabase/supabase-js@2.110.9";
import { gmailConfig, sendGmailMessage } from "../payroll/gmail.ts";
import { supportNotificationCopy, uniqueRecipients, type SupportArea, type SupportEvent } from "./model.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });

export async function handleSupportNotification(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Sign in required" }, 401);
    const auth = await db.auth.getUser(token);
    if (auth.error || !auth.data.user) return json({ error: "Sign in required" }, 401);

    const body = await req.json();
    const event = body.event as SupportEvent;
    if (!/^[0-9a-f-]{36}$/i.test(String(body.ticket_id ?? "")) || !["submitted", "completed"].includes(event)) {
      return json({ error: "Invalid notification request" }, 400);
    }

    const profileResult = await db.from("profiles").select("id,role,active,full_name").eq("id", auth.data.user.id).maybeSingle();
    if (profileResult.error || !profileResult.data?.active) return json({ error: "Access denied" }, 403);

    const ticketResult = await db
      .from("support_tickets")
      .select("id,area,status,severity,description,submitted_by,stores(name),profiles!support_tickets_submitted_by_fkey(full_name)")
      .eq("id", body.ticket_id)
      .maybeSingle();
    if (ticketResult.error || !ticketResult.data) return json({ error: "Request not found" }, 404);
    const ticket = ticketResult.data as any;
    const area = ticket.area as SupportArea;

    const capability = await db.from("profile_capabilities").select("profile_id").eq("profile_id", profileResult.data.id).eq("capability", area).maybeSingle();
    const canRespond = profileResult.data.role === "admin" || Boolean(capability.data);
    if (event === "submitted" && ticket.submitted_by !== profileResult.data.id && profileResult.data.role !== "admin") {
      return json({ error: "Only the submitter can send this notification" }, 403);
    }
    if (event === "completed" && (!canRespond || ticket.status !== "completed")) {
      return json({ error: "Only an authorized responder can complete this notification" }, 403);
    }

    const responderRows = await db.from("profile_capabilities").select("profile_id").eq("capability", area);
    if (responderRows.error) throw new Error("Responder list could not be loaded.");
    const responderIds = (responderRows.data ?? []).map((row: { profile_id: string }) => row.profile_id);
    if (!responderIds.length) return json({ ok: false, sent: 0, failed: 0, error: `No ${area} responders are assigned.` });

    const profilesResult = await db.from("profiles").select("id,email,full_name").in("id", responderIds).eq("active", true);
    if (profilesResult.error) throw new Error("Responder email addresses could not be loaded.");
    const recipients = uniqueRecipients((profilesResult.data ?? []) as { id: string; email: string | null; full_name: string | null }[]);
    const gmail = gmailConfig();
    if (!gmail) return json({ error: "The DASH-OS Gmail sender is not configured." }, 503);

    const store = Array.isArray(ticket.stores) ? ticket.stores[0] : ticket.stores;
    const submitter = Array.isArray(ticket.profiles) ? ticket.profiles[0] : ticket.profiles;
    const copy = supportNotificationCopy({
      event,
      area,
      storeName: store?.name ?? "Store",
      severity: ticket.severity,
      description: ticket.description,
      submittedBy: submitter?.full_name ?? "Team member",
      actedBy: profileResult.data.full_name ?? "DASH-OS responder",
      portalUrl: Deno.env.get("DASH_OS_URL")?.trim() || "https://team-powers-portal.daustin-15d.workers.dev/",
    });

    let sent = 0, failed = 0;
    for (const recipient of recipients) {
      const logResult = await db.from("support_ticket_notifications").insert({
        ticket_id: ticket.id,
        event,
        recipient_profile_id: recipient.id,
        recipient_email: recipient.email,
        status: "sending",
      }).select("id").maybeSingle();
      if (logResult.error?.code === "23505") continue;
      if (logResult.error || !logResult.data) throw new Error("Notification delivery could not be recorded.");
      try {
        const providerId = await sendGmailMessage(gmail, {
          id: logResult.data.id,
          to: recipient.email!,
          subject: copy.subject,
          text: copy.text,
        });
        await db.from("support_ticket_notifications").update({ status: "sent", sent_at: new Date().toISOString(), provider_id: providerId }).eq("id", logResult.data.id);
        sent += 1;
      } catch (error) {
        await db.from("support_ticket_notifications").update({ status: "failed", last_error: error instanceof Error ? error.message : "Gmail delivery failed" }).eq("id", logResult.data.id);
        failed += 1;
      }
    }
    return json({
      ok: failed === 0 && sent === recipients.length,
      sent,
      failed,
      ...(failed ? { error: "The request was saved, but responder email delivery failed." } : {}),
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Notification failed" }, 400);
  }
}

Deno.serve(handleSupportNotification);
