import { createClient } from "npm:@supabase/supabase-js@2.110.9";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers });

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function signature(value: unknown, required: boolean) {
  const result = typeof value === "string" ? value : "";
  if (!result && !required) return null;
  if (!result.startsWith("data:image/png;base64,") || result.length < 100 || result.length > 350_000) {
    throw new Error("Please provide a valid hand-drawn signature.");
  }
  return result;
}

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
    const outcome = body.outcome === "refused" ? "refused" : body.outcome === "acknowledged" ? "acknowledged" : "";
    if (!/^[0-9a-f-]{36}$/i.test(actionId) || !outcome) return json({ error: "Invalid acknowledgment request" }, 400);

    const [profileResult, actionResult, existingResult, revisionsResult] = await Promise.all([
      db.from("profiles").select("id,role,active,full_name,store_id").eq("id", auth.data.user.id).maybeSingle(),
      db.from("hr_disciplinary_actions").select("id,store_id,employee_name,employee_identifier,member_id,incident_date,action_type,policy_categories,incident_summary,action_taken,expectations,follow_up_date,witnesses,status,submitted_by,submitted_by_name,created_at,updated_at,amends_action_id").eq("id", actionId).maybeSingle(),
      db.from("hr_disciplinary_action_acknowledgments").select("id").eq("action_id", actionId).maybeSingle(),
      db.from("hr_disciplinary_action_revisions").select("id", { count: "exact", head: true }).eq("action_id", actionId),
    ]);
    const profile = profileResult.data as any;
    const action = actionResult.data as any;
    if (!profile?.active || !["manager", "supervisor", "admin"].includes(profile.role)) return json({ error: "Access denied" }, 403);
    if (!action) return json({ error: "HR record not found" }, 404);
    if (action.action_type === "termination") return json({ error: "Termination records use the separation signature workflow" }, 400);
    if (existingResult.data) return json({ error: "This HR record has already been signed and is permanently locked" }, 409);
    if (profile.role === "manager" && action.submitted_by !== profile.id) return json({ error: "Managers may only collect signatures for records they submitted" }, 403);
    if (profile.role !== "admin" && profile.store_id !== action.store_id) {
      const assignment = await db.from("profile_store_assignments").select("store_id").eq("profile_id", profile.id).eq("store_id", action.store_id).maybeSingle();
      if (assignment.error || !assignment.data) return json({ error: "Store access denied" }, 403);
    }

    const employeeName = String(body.employee_name ?? action.employee_name).trim();
    const employeeStatement = String(body.employee_statement ?? "").trim().slice(0, 10_000);
    const witnessName = outcome === "refused" ? String(body.witness_name ?? "").trim() : null;
    const employeeConsent = outcome === "acknowledged" && body.employee_consented === true;
    if (employeeName.length < 2) return json({ error: "Confirm the employee's full name" }, 400);
    if (outcome === "acknowledged" && !employeeConsent) return json({ error: "The employee must affirmatively consent before signing" }, 400);
    if (outcome === "refused" && (!witnessName || witnessName.length < 2)) return json({ error: "A witness is required when the employee declines to sign" }, 400);

    const employeeSignature = signature(body.employee_signature_data, outcome === "acknowledged");
    const managerSignature = signature(body.manager_signature_data, true)!;
    const witnessSignature = signature(body.witness_signature_data, outcome === "refused");
    const signedAt = new Date().toISOString();
    const signatureHashes = {
      employee: employeeSignature ? await sha256(employeeSignature) : null,
      manager: await sha256(managerSignature),
      witness: witnessSignature ? await sha256(witnessSignature) : null,
    };
    const recordVersion = (revisionsResult.count ?? 0) + 1;
    const recordSnapshot = {
      action,
      attestation: {
        outcome,
        employee_name: employeeName,
        employee_statement: employeeStatement,
        employee_consented: employeeConsent,
        manager_name: profile.full_name,
        witness_name: witnessName,
        signed_at: signedAt,
      },
      signature_sha256: signatureHashes,
    };
    const documentHash = await sha256(canonical(recordSnapshot));
    const forwarded = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

    const inserted = await db.from("hr_disciplinary_action_acknowledgments").insert({
      action_id: action.id,
      record_version: recordVersion,
      record_snapshot: recordSnapshot,
      document_sha256: documentHash,
      outcome,
      employee_name: employeeName,
      employee_signature_data: employeeSignature,
      employee_statement: employeeStatement,
      employee_consented: employeeConsent,
      employee_signed_at: outcome === "acknowledged" ? signedAt : null,
      manager_profile_id: profile.id,
      manager_name: profile.full_name,
      manager_signature_data: managerSignature,
      manager_signed_at: signedAt,
      witness_name: witnessName,
      witness_signature_data: witnessSignature,
      witness_signed_at: outcome === "refused" ? signedAt : null,
      signer_ip: forwarded,
      user_agent: (req.headers.get("user-agent") ?? "").slice(0, 1000),
      created_at: signedAt,
    }).select("id,document_sha256,created_at").single();
    if (inserted.error) throw new Error(inserted.error.code === "23505" ? "This HR record has already been signed and is permanently locked" : inserted.error.message);

    return json({ ok: true, acknowledgment: inserted.data });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "The signatures could not be finalized" }, 400);
  }
});
