import { createClient } from "npm:@supabase/supabase-js@2.110.9";
import { normalizeEmail, signInEmail, validEmail } from "./model.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });
const accepted = () => json({ ok: true });

async function sendWithResend(id: string, to: string, message: ReturnType<typeof signInEmail>) {
  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim();
  if (!apiKey) throw new Error("DASH email delivery is not configured");
  const fromEmail = Deno.env.get("DASH_FROM_EMAIL")?.trim() || "notifications@noreply.powerspizza.com";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `dash-member-auth-${id}`,
    },
    body: JSON.stringify({
      from: `DASHos Team Member Access <${fromEmail}>`,
      to: [to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.id !== "string") throw new Error("Secure email delivery was rejected");
  return result.id as string;
}

export async function handleTeamMemberAuth(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const db = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let deliveryId = "";
  try {
    const email = normalizeEmail((await req.json().catch(() => ({})))?.email);
    if (!validEmail(email)) return accepted();

    const memberResult = await db
      .from("labor_team_members")
      .select("id,display_name")
      .ilike("access_email", email)
      .eq("active", true)
      .in("employment_status", ["active", "borrowed"])
      .maybeSingle();
    if (memberResult.error) throw new Error("Active employee access could not be checked");
    if (!memberResult.data) return accepted();

    const recent = await db
      .from("team_member_auth_deliveries")
      .select("id")
      .eq("member_id", memberResult.data.id)
      .in("status", ["sending", "sent"])
      .gte("created_at", new Date(Date.now() - 60_000).toISOString())
      .limit(1);
    if (recent.error) throw new Error("Secure email delivery could not be checked");
    if (recent.data?.length) return accepted();

    const delivery = await db.from("team_member_auth_deliveries")
      .insert({ member_id: memberResult.data.id, status: "sending" })
      .select("id")
      .single();
    if (delivery.error || !delivery.data) throw new Error("Secure email delivery could not be recorded");
    deliveryId = delivery.data.id;

    const created = await db.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { dash_team_member: true },
    });
    if (created.error && !/already (been )?registered|already exists/i.test(created.error.message)) {
      throw new Error("Secure team member access could not be prepared");
    }

    const redirectTo = `${(Deno.env.get("DASH_OS_URL")?.trim() || "https://team-powers-portal.daustin-15d.workers.dev").replace(/\/$/, "")}/?team=1`;
    const generated = await db.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });
    if (generated.error || !generated.data.properties?.action_link) {
      throw new Error("Secure sign-in link could not be generated");
    }

    const providerId = await sendWithResend(
      deliveryId,
      email,
      signInEmail(memberResult.data.display_name, generated.data.properties.action_link),
    );
    await db.from("team_member_auth_deliveries").update({
      status: "sent", provider_id: providerId, sent_at: new Date().toISOString(), error_message: null,
    }).eq("id", deliveryId);
    return accepted();
  } catch (error) {
    if (deliveryId) await db.from("team_member_auth_deliveries").update({
      status: "failed",
      error_message: error instanceof Error ? error.message.slice(0, 500) : "Secure email delivery failed",
    }).eq("id", deliveryId);
    console.error("team-member-auth", error instanceof Error ? error.message : error);
    return json({ error: "Secure sign-in email could not be sent" }, 503);
  }
}

Deno.serve(handleTeamMemberAuth);
