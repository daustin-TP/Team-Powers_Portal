import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../supabase/migrations/20261111232145_hr_action_electronic_signatures.sql', import.meta.url), 'utf8');
const edge = readFileSync(new URL('../supabase/functions/hr-signatures/index.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/components/HumanResources.tsx', import.meta.url), 'utf8');
const pdf = readFileSync(new URL('../src/lib/hrRecordPdf.ts', import.meta.url), 'utf8');

test('signed HR records preserve a hashed immutable snapshot', () => {
  assert.match(migration, /record_snapshot jsonb not null/i);
  assert.match(migration, /document_sha256 text not null/i);
  assert.match(migration, /prevent_signed_hr_action_update/i);
  assert.match(migration, /Signed HR records are immutable/i);
  assert.match(edge, /crypto\.subtle\.digest\("SHA-256"/);
});

test('employee acknowledgment requires consent while refusal requires a witness', () => {
  assert.match(migration, /outcome = 'acknowledged'[\s\S]*employee_consented/i);
  assert.match(migration, /outcome = 'refused'[\s\S]*witness_signature_data/i);
  assert.match(ui, /I reviewed and received this disciplinary action/);
  assert.match(ui, /A witness name and signature are required/);
});

test('signature capture is authenticated and employees need no portal account', () => {
  assert.match(edge, /db\.auth\.getUser\(token\)/);
  assert.match(edge, /Managers may only collect signatures for records they submitted/);
  assert.doesNotMatch(edge, /employee_email|employee_user_id/);
});

test('signed PDFs include signature images and an audit fingerprint', () => {
  assert.match(pdf, /ELECTRONIC SIGNATURE AUDIT CERTIFICATE/);
  assert.match(pdf, /SHA-256/);
  assert.match(pdf, /pdf\.addImage\(row\.image/);
});

test('signed originals use linked amendments instead of edits', () => {
  assert.match(migration, /amends_action_id uuid references public\.hr_disciplinary_actions/i);
  assert.match(ui, /Create amendment/);
  assert.match(ui, /The signed original will remain permanently unchanged/);
});
