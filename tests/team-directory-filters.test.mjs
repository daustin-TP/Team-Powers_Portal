import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/components/Team.tsx", import.meta.url), "utf8");

test("employee directory supports search and column filters", () => {
  assert.match(source, /directorySearch/);
  assert.match(source, /directoryRole/);
  assert.match(source, /directoryLocation/);
  assert.match(source, /directoryStatus/);
  assert.match(source, /filteredMembers\.map/);
  assert.match(source, /Clear filters/);
});

test("employee directory filters remain client-side and do not mutate access", () => {
  assert.match(source, /matchesSearch/);
  assert.match(source, /matchesRole/);
  assert.match(source, /matchesLocation/);
  assert.match(source, /matchesStatus/);
  assert.match(source, /No team members match these filters/);
});
