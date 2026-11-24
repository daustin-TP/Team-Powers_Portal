import type { TemplateField } from "../components/VisitTemplateForm";

export type PaperAnswer = { field: TemplateField; value: string };

async function photoForImport(file: File) {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not prepare the photo.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.83);
  } finally { bitmap.close(); }
}

export async function readPaperPages(files: File[], token: string, title: string, fields: TemplateField[]) {
  const values = new Map<string, Set<string>>();
  const failures: string[] = [];
  for (const file of files) {
    try {
      const image = await photoForImport(file);
      const response = await fetch("/api/visit-paper-import", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ image, title, fields }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The page could not be read.");
      for (const field of fields) {
        const raw = payload.answers?.[field.key];
        if (typeof raw !== "string" || !raw.trim()) continue;
        const value = field.options ? field.options.find(option => option.toLowerCase() === raw.trim().toLowerCase()) : raw.trim();
        if (!value) continue;
        const seen = values.get(field.key) ?? new Set<string>();
        seen.add(value);
        values.set(field.key, seen);
      }
    } catch (error) {
      failures.push(`${file.name}: ${error instanceof Error ? error.message : "The page could not be read."}`);
    }
  }
  const answers = fields.flatMap(field => {
    const seen = values.get(field.key);
    return seen?.size === 1 ? [{ field, value: [...seen][0] }] : [];
  });
  return { answers, failures, conflicts: [...values.values()].filter(seen => seen.size > 1).length };
}

export function mergePaperAnswers<T extends object>(form: T, answers: PaperAnswer[]): { form: T; applied: number } {
  const next = structuredClone(form);
  let applied = 0;
  for (const { field, value } of answers) {
    const path = field.key.split(".");
    if (path.some(part => !/^[a-zA-Z0-9_]+$/.test(part) || ["__proto__", "prototype", "constructor"].includes(part))) continue;
    let target = next as Record<string, unknown>;
    for (const parent of path.slice(0, -1)) {
      if (!Object.hasOwn(target, parent)) target[parent] = {};
      target = target[parent] as Record<string, unknown>;
    }
    const key = path[path.length - 1];
    if (target[key]) continue;
    let answer: string | boolean = value.trim();
    if (field.options && !field.options.includes(answer)) continue;
    if (field.type === "time" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(answer)) continue;
    if (field.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(answer)) continue;
    if (key === "rating" || field.key === "goals.posted") answer = answer.toLowerCase().replace("/", "");
    if (key === "completed") answer = answer === "Yes";
    if (answer === "") continue;
    target[key] = answer;
    applied++;
  }
  return { form: next, applied };
}
