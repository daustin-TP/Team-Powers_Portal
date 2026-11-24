import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

test("every visit produces a letter worksheet and filled recap within two pages", async () => {
  const server = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  try {
    const { buildVisitPdf } = await server.ssrLoadModule("/src/lib/visitPdf.ts");
    const { visitPaperSections } = await server.ssrLoadModule("/src/components/SupervisorVisitLog.tsx");
    const { visitTemplates } = await server.ssrLoadModule("/src/components/VisitTemplateForm.tsx");
    for (const title of ["General Supervisor Visit", ...Object.keys(visitTemplates)]) {
      const sections = visitPaperSections(title);
      const details = ["Jamestown", "11/24/2026", "3:00 PM"];
      const worksheet = buildVisitPdf({ title, details, sections, worksheet: true, values: {} });
      const values = Object.fromEntries(sections.flatMap(section => [
        ...section.fields.map(field => [field.key, field.options?.[0] ?? "Recorded answer"]),
        [`visitNotes.${section.key}`, "Store coaching notes. ".repeat(100)],
      ]));
      const recap = buildVisitPdf({ title, details, sections, worksheet: false, values });
      assert.ok(worksheet.getNumberOfPages() <= 2, title);
      assert.ok(recap.getNumberOfPages() <= 2, title);
      for (const pdf of [worksheet, recap]) {
        assert.equal(pdf.internal.pageSize.getWidth(), 612);
        assert.equal(pdf.internal.pageSize.getHeight(), 792);
        assert.ok(pdf.internal.pages.slice(1).every(page => page.some(line => line.includes("TEAM POWERS"))));
      }
    }
  } finally {
    await server.close();
  }
});
