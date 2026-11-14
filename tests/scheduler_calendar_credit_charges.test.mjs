import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const labor=readFileSync(new URL("../src/components/LaborManagement.tsx",import.meta.url),"utf8");
const calendar=readFileSync(new URL("../src/components/OperationsCalendar.tsx",import.meta.url),"utf8");
const receipts=readFileSync(new URL("../src/components/Receipts.tsx",import.meta.url),"utf8");
const review=readFileSync(new URL("../src/components/Reconciliation.tsx",import.meta.url),"utf8");
const app=readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
const migration=readFileSync(new URL("../supabase/migrations/20261113110000_event_audit_and_credit_charge_billing.sql",import.meta.url),"utf8");

test("edited automated shifts show the original suggested time",()=>{
  assert.match(labor,/Originally suggested:/);
  assert.match(labor,/before_state\?\.source === "suggested"/);
});

test("preferred celebration names are collapsed by default",()=>{
  assert.match(labor,/<details className="roster-preferred-names">/);
  assert.match(labor,/<summary><strong>Celebration names<\/strong>/);
});

test("calendar events show creator and latest editor attribution",()=>{
  assert.match(calendar,/Created by \{item\.created_by_name/);
  assert.match(calendar,/Edited by \{item\.updated_by_name/);
  assert.match(migration,/created_by_name text/);
  assert.match(migration,/updated_by_name text/);
});

test("company credit charges are supervisor and admin only",()=>{
  assert.match(app,/Company Credit Charges[^\n]+roles: \["supervisor", "admin"\]/);
  assert.match(migration,/company card users submit receipts/);
  assert.match(migration,/in \('supervisor','admin'\)/);
});

test("charges require billing scope and support quick acknowledgement",()=>{
  assert.match(receipts,/billing_store_ids/);
  assert.match(receipts,/All stores/);
  assert.match(receipts,/HQ \/ Admin purchase/);
  assert.match(review,/Received & acknowledged/);
  assert.match(review,/<th>Bill to<\/th>/);
});
