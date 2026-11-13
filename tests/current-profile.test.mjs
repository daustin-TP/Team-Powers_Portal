import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/202611130001_atomic_current_profile.sql", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("current profile lookup is atomic and limited to the signed-in user", () => {
  assert.match(migration, /where p\.id = auth\.uid\(\) and p\.active = true/i);
  assert.match(migration, /array_agg\(distinct pp\.permission\)/i);
  assert.match(migration, /security definer/i);
});

test("anonymous users cannot call the protected profile lookup", () => {
  assert.match(migration, /revoke all on function public\.portal_current_profile\(\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.portal_current_profile\(\) to authenticated, service_role/i);
});

test("the application loads identity and permissions in one request", () => {
  assert.match(app, /rpc\("portal_current_profile"\)/);
  assert.match(app, /permissions: row\.permissions \?\? \[\]/);
});
