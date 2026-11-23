import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const login = fs.readFileSync(new URL("../src/components/Login.tsx", import.meta.url), "utf8");
const edge = fs.readFileSync(new URL("../supabase/functions/team-member-auth/index.ts", import.meta.url), "utf8");
const model = fs.readFileSync(new URL("../supabase/functions/team-member-auth/model.ts", import.meta.url), "utf8");

test("team member sign-in uses the branded delivery function instead of Supabase SMTP", () => {
  assert.match(login, /functions\.invoke\("team-member-auth"/);
  assert.doesNotMatch(login, /signInWithOtp/);
});

test("public email endpoint only sends to active roster members and throttles repeats", () => {
  assert.match(edge, /\.eq\("active", true\)/);
  assert.match(edge, /\.in\("employment_status", \["active", "borrowed"\]\)/);
  assert.match(edge, /Date\.now\(\) - 60_000/);
  assert.match(edge, /return accepted\(\)/);
});

test("secure email is branded and uses a one-time generated action link", () => {
  assert.match(edge, /auth\.admin\.generateLink/);
  assert.match(edge, /RESEND_API_KEY/);
  assert.match(model, /one-time sign-in link/i);
  assert.match(model, /Open DASH securely/);
});
