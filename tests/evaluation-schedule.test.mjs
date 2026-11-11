import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const context = { exports: {}, Date };
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/lib/evaluationSchedule.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const schedule = context.exports;

test("evaluations open 14 days before the qualifying date", () => {
  assert.equal(schedule.evaluationWindow("2026-11-15", "2026-10-31").status, "upcoming");
  const firstAvailable = schedule.evaluationWindow("2026-11-15", "2026-11-01");
  assert.equal(firstAvailable.availableDate, "2026-11-01");
  assert.equal(firstAvailable.status, "available");
});

test("evaluations remain due through seven days after the qualifying date", () => {
  assert.equal(schedule.evaluationWindow("2026-11-15", "2026-11-15").status, "due");
  const finalDueDay = schedule.evaluationWindow("2026-11-15", "2026-11-22");
  assert.equal(finalDueDay.deadlineDate, "2026-11-22");
  assert.equal(finalDueDay.status, "due");
  assert.equal(schedule.evaluationWindow("2026-11-15", "2026-11-23").status, "past_due");
});

test("automatic evaluation tracking starts in November 2026", () => {
  assert.equal(schedule.EVALUATION_LIVE_DATE, "2026-11-01");
  assert.equal(schedule.isLiveEvaluation("2026-10-31"), false);
  assert.equal(schedule.isLiveEvaluation("2026-11-01"), true);
});
