import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
function load(path, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      require: (name) => {
        if (name in imports) return imports[name];
        throw Error("Unexpected import: " + name);
      },
      URL,
      TextEncoder,
      crypto,
      Date,
      console,
      ...globals,
    },
  );
  return exports;
}
const styles = load("../src/celebrations/caption-style.ts");
const model = load("../src/celebrations/model.ts");
const render = load("../src/celebrations/render.ts", {
  "./caption-style": styles,
});
let handler;
const feed = load(
  "../supabase/functions/celebration-feed/index.ts",
  { "npm:@supabase/supabase-js@2.110.9": { createClient: () => db } },
  {
    Deno: {
      serve: (h) => (handler = h),
      env: {
        get: (n) =>
          n === "SUPABASE_URL"
            ? "https://project.supabase.co"
            : "server-secret",
      },
    },
    Request,
    Response,
    Blob,
  },
);
let tokenRecord = true,
  items = [],
  downloads = 0,
  failed = false;
const db = {
  from(table) {
    let filters = [];
    return {
      select() {
        return this;
      },
      eq(k, v) {
        filters.push([k, v]);
        return this;
      },
      gt(k, v) {
        filters.push([k, v, "gt"]);
        return this;
      },
      order() {
        return this;
      },
      async maybeSingle() {
        if (failed) throw Error("db down");
        if (table === "celebration_playback_keys")
          return { data: tokenRecord ? { id: "key" } : null, error: null };
        return {
          data:
            items.find((i) =>
              filters.every(([k, v, op]) =>
                op === "gt" ? i[k] > v : i[k] === v,
              ),
            ) || null,
        };
      },
      then(resolve, reject) {
        return Promise.resolve(
          failed
            ? { data: null, error: Error("db down") }
            : {
                data: items.filter((i) =>
                  filters.every(([k, v, op]) =>
                    op === "gt" ? i[k] > v : i[k] === v,
                  ),
                ),
                error: null,
              },
        ).then(resolve, reject);
      },
    };
  },
  storage: {
    from() {
      return {
        async download() {
          downloads++;
          return { data: new Blob(["PNG"]), error: null };
        },
      };
    },
  },
};
test("Dash-OS leadership roles require an active directory account", () => {
  for (const role of ["manager", "supervisor", "admin"])
    assert.equal(model.canUseCelebrations({ role, active: true }), true);
  for (const role of ["employee", "accounting", "unknown"])
    assert.equal(model.canUseCelebrations({ role, active: true }), false);
  assert.equal(
    model.canUseCelebrations({ role: "manager", active: false }),
    false,
  );
  assert.equal(
    model.canApprove({
      role: "admin",
      active: true,
      email: "DAUSTIN@powerspizza.com",
    }),
    true,
  );
  assert.equal(
    model.canApprove({
      role: "admin",
      active: true,
      email: "other@powerspizza.com",
    }),
    false,
  );
  assert.equal(
    model.canApprove({
      role: "manager",
      active: true,
      email: "daustin@powerspizza.com",
    }),
    false,
  );
});
test("only approved unexpired slides count toward the ten-second loop", () => {
  const now = Date.now();
  const slides = [
    { status: "approved", expires_at: new Date(now + 100).toISOString() },
    { status: "pending", expires_at: new Date(now + 100).toISOString() },
    { status: "approved", expires_at: new Date(now).toISOString() },
  ];
  assert.equal(model.loopSeconds(slides, now), 10);
  assert.equal(model.loopSeconds([], now), 0);
});
test("caption styles reject out-of-frame and unsafe values", () => {
  assert.ok(styles.validateStyle(styles.defaultStyle));
  for (const value of [
    { font: "__proto__" },
    { color: "red;opacity:0" },
    { x: 99 },
    { size: Infinity },
    { width: 100 },
    { align: "invalid" },
  ])
    assert.equal(
      styles.validateStyle({ ...styles.defaultStyle, ...value }),
      null,
    );
});
test("rendered caption wrapping preserves paragraphs and splits long Unicode words", () => {
  assert.equal(
    render.wrapCaption("One two\nThree", 7, (s) => s.length).join("|"),
    "One two|Three",
  );
  assert.equal(
    render.wrapCaption("abcdefghijk", 4, (s) => s.length).join("|"),
    "abcd|efgh|ijk",
  );
  assert.equal(
    render.wrapCaption("hi\n\nthere", 12, (s) => s.length).join("|"),
    "hi||there",
  );
});
test("Media RSS includes ten-second duration, image size, escaped captions and revision GUIDs", () => {
  const xml = feed.buildRss(
    [
      {
        id: "1",
        caption: 'Team <A> & "B"',
        updated_at: "today",
        slide_bytes: 25,
      },
    ],
    (id) => "https://feed.test/?token=x&image=" + id,
  );
  assert.match(xml, /duration="10"/);
  assert.match(xml, /fileSize="25"/);
  assert.match(xml, /Team &lt;A&gt; &amp; &quot;B&quot;/);
  assert.match(xml, /&amp;image=1/);
  assert.match(xml, />1:today<\/guid>/);
});
test("public feed validates playback keys and never exposes pending, expired, or original photos", async () => {
  assert.equal((await handler(new Request("https://feed.test"))).status, 401);
  tokenRecord = false;
  assert.equal(
    (await handler(new Request("https://feed.test?token=" + "a".repeat(64))))
      .status,
    403,
  );
  tokenRecord = true;
  const id = "11111111-1111-4111-8111-111111111111";
  const now = Date.now();
  items = [
    {
      id,
      status: "approved",
      expires_at: new Date(now + 100000).toISOString(),
      caption: "Great work",
      slide_path: "finished.png",
      slide_bytes: 3,
      updated_at: "today",
    },
    {
      id: "pending",
      status: "pending",
      expires_at: new Date(now + 100000).toISOString(),
    },
    {
      id: "expired",
      status: "approved",
      expires_at: new Date(now - 1).toISOString(),
    },
  ];
  const request = "https://feed.test?token=" + "a".repeat(64);
  const result = await handler(new Request(request + "&format=json"));
  const json = await result.json();
  assert.equal(json.slide_count, 1);
  assert.equal(json.duration_seconds, 10);
  assert.equal(json.items[0].slide_path, undefined);
  assert.equal(
    (await handler(new Request(request + "&image=" + id))).status,
    200,
  );
  assert.equal(downloads, 1);
  items[0].status = "removed";
  assert.equal(
    (await handler(new Request(request + "&image=" + id))).status,
    404,
  );
  assert.equal(downloads, 1);
  tokenRecord = false;
  assert.equal(
    (await handler(new Request(request + "&image=" + id))).status,
    403,
  );
  tokenRecord = true;
  failed = true;
  assert.equal((await handler(new Request(request))).status, 503);
  failed = false;
  assert.equal(
    (await handler(new Request(request, { method: "POST" }))).status,
    405,
  );
});
