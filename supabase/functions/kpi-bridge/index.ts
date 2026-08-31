import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type KpiAction = "get_commitments" | "update_commitment";

type RequestBody = {
  action?: KpiAction;
  week_end?: string;
  store?: string;
  changes?: Record<string, unknown>;
};

const editableFields = new Set([
  "supervisor_sales_goal",
  "focus_area",
  "action_plan",
  "owner",
  "supervisor_labor_goal",
  "supervisor_splh_goal",
  "supervisor_food_variance_goal",
  "supervisor_load_goal",
  "supervisor_adt_goal",
]);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed." }, 405);
  }

  try {
    const authHeader = request.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) throw new HttpError(401, "Sign in is required.");

    const supabaseUrl = requireSecret("SUPABASE_URL");
    const serviceRoleKey = resolveAdminKey();
    const bridgeUrl = requireSecret("DASH_SOS_APPS_SCRIPT_URL");
    const bridgeSecret = requireSecret("DASH_SOS_BRIDGE_SECRET");
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) {
      throw new HttpError(401, "Your sign-in session is no longer valid.");
    }

    const userId = authData.user.id;
    const [{ data: profile, error: profileError }, { data: permissions, error: permissionsError }] =
      await Promise.all([
        admin
          .from("profiles")
          .select("id,email,role,active,store_id")
          .eq("id", userId)
          .maybeSingle(),
        admin
          .from("profile_permissions")
          .select("permission")
          .eq("profile_id", userId),
      ]);

    if (profileError || !profile || !profile.active) {
      throw new HttpError(403, "KPI access is not active for this account.");
    }
    if (permissionsError) throw permissionsError;

    const permissionSet = new Set(
      (permissions ?? []).map((row) => String(row.permission)),
    );
    const isAdmin = profile.role === "admin";
    const canView = isAdmin || permissionSet.has("kpi_view") || permissionSet.has("kpi_view_all");
    const canViewAll = isAdmin || permissionSet.has("kpi_view_all");
    const canEdit = isAdmin || permissionSet.has("kpi_edit_goals");

    if (!canView) throw new HttpError(403, "You do not have KPI access.");

    const body = (await request.json()) as RequestBody;
    if (!body.action || !["get_commitments", "update_commitment"].includes(body.action)) {
      throw new HttpError(400, "A valid KPI action is required.");
    }
    if (!body.week_end || !/^\d{4}-\d{2}-\d{2}$/.test(body.week_end)) {
      throw new HttpError(400, "A valid week-ending date is required.");
    }

    const assignedStores = await loadAssignedStoreNames(admin, userId, profile.store_id);
    const allowedStores = canViewAll ? null : assignedStores;

    if (!canViewAll && allowedStores.length === 0) {
      throw new HttpError(403, "No stores are assigned to your KPI access.");
    }

    let bridgeRequest: Record<string, unknown>;
    if (body.action === "get_commitments") {
      bridgeRequest = {
        action: "get_commitments",
        week_end: body.week_end,
        stores: canViewAll ? null : allowedStores,
      };
    } else {
      if (!canEdit) throw new HttpError(403, "Your KPI access is read-only.");
      const store = String(body.store ?? "").trim();
      if (!store) throw new HttpError(400, "A store is required.");
      if (!isAdmin && !assignedStores.includes(store)) {
        throw new HttpError(403, "You can compare that store, but only its assigned supervisor or an administrator can edit its goals.");
      }
      if (!body.changes || typeof body.changes !== "object" || Array.isArray(body.changes)) {
        throw new HttpError(400, "A changes object is required.");
      }
      for (const key of Object.keys(body.changes)) {
        if (!editableFields.has(key)) {
          throw new HttpError(400, `Field is not editable: ${key}`);
        }
      }
      bridgeRequest = {
        action: "update_commitment",
        week_end: body.week_end,
        store,
        changes: body.changes,
      };
    }

    const bridgeResult = await callAppsScript(bridgeUrl, bridgeSecret, bridgeRequest);

    if (body.action === "update_commitment") {
      await admin.from("audit_events").insert({
        actor_id: userId,
        action: "kpi.commitment.updated",
        resource_type: "goal_commitment",
        resource_id: `${body.week_end}:${body.store}`,
        metadata: {
          week_end: body.week_end,
          store: body.store,
          changed_fields: Object.keys(body.changes ?? {}),
        },
      });
    }

    const supervisorGroups = canViewAll ? await loadSupervisorGroups(admin) : [];

    return json({
      ok: true,
      result: bridgeResult,
      access: {
        can_edit: canEdit,
        can_view_all: canViewAll,
        assigned_stores: assignedStores,
        editable_stores: isAdmin ? null : assignedStores,
        supervisor_groups: supervisorGroups,
      },
    });
  } catch (error) {
    console.error(error);
    if (error instanceof HttpError) {
      return json({ ok: false, error: error.message }, error.status);
    }
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "The KPI connection failed.",
      },
      500,
    );
  }
});

async function loadAssignedStoreNames(
  admin: ReturnType<typeof createClient>,
  userId: string,
  primaryStoreId: string | null,
) {
  const { data, error } = await admin
    .from("profile_store_assignments")
    .select("store_id,stores(name)")
    .eq("profile_id", userId);
  if (error) throw error;

  const names = new Set<string>();
  for (const row of data ?? []) {
    const stores = row.stores as unknown as { name?: string } | { name?: string }[] | null;
    const name = Array.isArray(stores) ? stores[0]?.name : stores?.name;
    if (name) names.add(String(name).trim());
  }

  if (names.size === 0 && primaryStoreId) {
    const { data: primaryStore, error: primaryError } = await admin
      .from("stores")
      .select("name")
      .eq("id", primaryStoreId)
      .maybeSingle();
    if (primaryError) throw primaryError;
    if (primaryStore?.name) names.add(String(primaryStore.name).trim());
  }

  return Array.from(names).filter(Boolean);
}

async function loadSupervisorGroups(admin: ReturnType<typeof createClient>) {
  const [profilesResult, assignmentsResult, storesResult] = await Promise.all([
    admin.from("profiles").select("id,full_name,store_id").eq("role", "supervisor").eq("active", true),
    admin.from("profile_store_assignments").select("profile_id,store_id"),
    admin.from("stores").select("id,name").eq("active", true),
  ]);
  if (profilesResult.error) throw profilesResult.error;
  if (assignmentsResult.error) throw assignmentsResult.error;
  if (storesResult.error) throw storesResult.error;

  const storeNames = new Map((storesResult.data ?? []).map((store) => [store.id, String(store.name).trim()]));
  const assignments = new Map<string, Set<string>>();
  for (const row of assignmentsResult.data ?? []) {
    const name = storeNames.get(row.store_id);
    if (!name) continue;
    if (!assignments.has(row.profile_id)) assignments.set(row.profile_id, new Set());
    assignments.get(row.profile_id)?.add(name);
  }

  return (profilesResult.data ?? []).map((profile) => {
    const stores = assignments.get(profile.id) ?? new Set<string>();
    const primaryName = profile.store_id ? storeNames.get(profile.store_id) : undefined;
    if (primaryName) stores.add(primaryName);
    return { id: profile.id, name: profile.full_name || "Unnamed supervisor", stores: Array.from(stores).sort() };
  }).filter((group) => group.stores.length > 0).sort((a, b) => a.name.localeCompare(b.name));
}

async function callAppsScript(
  url: string,
  secret: string,
  payload: Record<string, unknown>,
) {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify(payload);
  const signature = await hmacHex(secret, `${timestamp}.${body}`);
  const response = await fetch(url, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timestamp, body, signature }),
  });

  if (!response.ok) {
    throw new Error(`Google bridge returned HTTP ${response.status}.`);
  }
  const result = await response.json();
  if (!result?.ok) throw new Error(result?.error || "Google bridge rejected the request.");
  return result.result;
}

async function hmacHex(secret: string, message: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function requireSecret(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function resolveAdminKey() {
  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacyKey) return legacyKey;

  const secretKeysJson = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeysJson) {
    const parsed = JSON.parse(secretKeysJson) as Record<string, string>;
    const firstKey = Object.values(parsed).find(Boolean);
    if (firstKey) return firstKey;
  }

  throw new Error("A Supabase server secret key is not available to the function.");
}

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
