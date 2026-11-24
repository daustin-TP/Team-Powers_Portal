import assert from "node:assert/strict";
import test from "node:test";
import { mergePaperAnswers } from "../src/lib/visitPaperImport.ts";
import worker from "../workers/visit-paper-import.js";

test("reviewed answers fill blank fields, preserve scheduled values, and support checkboxes", () => {
  const form = { visitTime: "15:00", checks: {}, visitNotes: {}, templateData: {}, followUps: [{ completed: false }] };
  const result = mergePaperAnswers(form, [
    { field: { key: "visitTime", type: "time" }, value: "16:30" },
    { field: { key: "checks.exterior.rating", options: ["Yes", "No", "N/A"] }, value: "N/A" },
    { field: { key: "visitNotes.details" }, value: "Coached positioning" },
    { field: { key: "templateData.rush_start", type: "time" }, value: "26:00" },
    { field: { key: "followUps.0.completed", options: ["Yes", "No"] }, value: "Yes" },
  ]);
  assert.equal(result.applied, 3);
  assert.equal(result.form.visitTime, "15:00");
  assert.equal(result.form.checks.exterior.rating, "na");
  assert.equal(result.form.visitNotes.details, "Coached positioning");
  assert.deepEqual(result.form.templateData, {});
  assert.equal(result.form.followUps[0].completed, true);
  assert.deepEqual(form.checks, {});
});

test("paper import checks DASH permissions and only returns requested answers", async t => {
  const url = "https://example.test/api/visit-paper-import";
  assert.equal((await worker.fetch(new Request(url, { method: "POST" }), {})).status, 401);
  const body = JSON.stringify({
    image: "data:image/jpeg;base64,AA==",
    title: "Observation of the Rush",
    fields: [{ key: "visitNotes.rush_product", label: "Product notes" }],
  });
  const request = () => new Request(url, { method: "POST", body, headers: {
    Authorization: "Bearer test", "Content-Length": String(body.length),
  } });
  const profile = t.mock.method(globalThis, "fetch", async () => Response.json([{ active: true, role: "manager" }]));
  assert.equal((await worker.fetch(request(), {})).status, 403);
  profile.mock.mockImplementation(async () => Response.json([{ active: true, role: "supervisor" }]));
  const env = { AI: { run: async () => ({ choices: [{ message: { content: JSON.stringify({
    "visitNotes.rush_product": "Good bake", unauthorized: "Ignore",
  }) } }] }) } };
  const response = await worker.fetch(request(), env);
  assert.deepEqual(await response.json(), { answers: { "visitNotes.rush_product": "Good bake" } });
});
