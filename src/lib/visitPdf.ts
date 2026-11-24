import { jsPDF } from "jspdf";
import type { TemplateField } from "../components/VisitTemplateForm";

export type PaperSection = { key: string; label: string; fields: TemplateField[] };
export type VisitPdfData = {
  title: string;
  worksheet: boolean;
  details: string[];
  sections: PaperSection[];
  values: Record<string, string>;
};

const margins = 30;
const gap = 16;
const bodyTop = 112;
const bodyBottom = 748;
const navy = "#0a3658";
const clean = (value: string) => value.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-");

type Row = { heading?: string; label?: string[]; key?: string; choices?: string[]; answer?: string[]; writing?: number; comment?: boolean; height: number };

function makeRows(pdf: jsPDF, data: VisitPdfData, width: number, size: number, noteLines: number, writingSize: number): Row[] {
  const line = size + 2;
  const wrap = (value: string, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal").setFontSize(size);
    return pdf.splitTextToSize(clean(value), width - 3) as string[];
  };
  const rows: Row[] = [];
  for (const section of data.sections) {
    const fields = [...section.fields, { key: `visitNotes.${section.key}`, label: "Visit notes", type: "textarea" as const }];
    const visible = data.worksheet ? fields : fields.filter(field => data.values[field.key]?.trim());
    if (!visible.length) continue;
    rows.push({ heading: section.label, height: 19 });
    for (const [index, field] of visible.entries()) {
      const value = data.values[field.key]?.trim() ?? "";
      const label = wrap(field.label, true);
      if (!data.worksheet) {
        const lines = wrap(value);
        const answer = lines.slice(0, noteLines);
        if (lines.length > noteLines) answer[answer.length - 1] = "[Continued in DASH]";
        rows.push({ label, answer, height: (label.length + answer.length) * line + 4 });
      } else if (field.options) {
        const choices = wrap(field.options.map(option => `[ ] ${option}`).join("   "));
        const comment = field.key.endsWith(".rating") && visible[index + 1]?.key === field.key.replace(/\.rating$/, ".comment");
        rows.push({ label, key: comment ? field.key.replace(/\.rating$/, "") : field.key, choices, comment, height: (label.length + choices.length) * line + (comment ? 21 : 7) });
      } else {
        if (field.key.endsWith(".comment") && visible[index - 1]?.key === field.key.replace(/\.comment$/, ".rating")) continue;
        const writing = field.type === "textarea" ? writingSize : 10;
        rows.push({ label, key: field.key, writing, height: label.length * line + 8 + writing });
      }
    }
  }
  return rows.length ? rows : [{ heading: "No answers recorded yet", height: 19 }];
}

function pack(rows: Row[]) {
  const columns: Row[][] = [[]];
  let height = 0;
  rows.forEach((row, index) => {
    const nextHeight = row.heading ? (rows[index + 1]?.height ?? 0) : 0;
    if (height && height + row.height + nextHeight > bodyBottom - bodyTop) {
      columns.push([]);
      height = 0;
    }
    columns[columns.length - 1].push(row);
    height += row.height;
  });
  return columns;
}

export function buildVisitPdf(data: VisitPdfData) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const sizes = [
    { perPage: 2, font: 9.5, lines: 14, writing: 31 },
    { perPage: 2, font: 9, lines: 8, writing: 27 },
    { perPage: 2, font: 8.5, lines: 5, writing: 22 },
    { perPage: 3, font: 8.5, lines: 5, writing: 22 },
    { perPage: 3, font: 8, lines: 3, writing: 19 },
    { perPage: 3, font: 7.5, lines: 2, writing: 16 },
    { perPage: 3, font: 7.5, lines: 1, writing: 14 },
  ];
  let size = sizes[0];
  let width = 0;
  let columns: Row[][] = [];
  for (const candidate of sizes) {
    size = candidate;
    width = (pageWidth - margins * 2 - gap * (size.perPage - 1)) / size.perPage;
    columns = pack(makeRows(pdf, data, width, size.font, size.lines, size.writing));
    if (columns.length <= 2 * size.perPage) break;
  }
  if (columns.length > 2 * size.perPage) throw new Error("The visit could not be fitted to two pages.");
  const totalPages = Math.ceil(columns.length / size.perPage);
  pdf.setProperties({ title: data.title, author: "Team Powers | DASH" });
  for (let page = 0; page < totalPages; page++) {
    if (page) pdf.addPage();
    pdf.setTextColor(navy).setFont("helvetica", "bold").setFontSize(10);
    pdf.text("TEAM POWERS  /  DASH", margins, 38);
    pdf.setFontSize(19).text(clean(data.title), margins, 61, { maxWidth: pageWidth - 2 * margins });
    pdf.setFont("helvetica", "normal").setFontSize(9);
    pdf.text(clean(data.details.join("  |  ")), margins, 78, { maxWidth: pageWidth - 2 * margins });
    pdf.setDrawColor(navy).line(margins, 94, pageWidth - margins, 94);
    if (data.worksheet) pdf.setFontSize(8).text("Write in dark ink. Mark one choice per question. Photograph the full page for import.", margins, 105);
    const line = size.font + 2;
    columns.slice(page * size.perPage, (page + 1) * size.perPage).forEach((column, columnIndex) => {
      const x = margins + columnIndex * (width + gap);
      let y = bodyTop;
      for (const row of column) {
        if (row.heading) {
          pdf.setFillColor("#e9f1f6").rect(x, y, width, 15, "F");
          pdf.setTextColor(navy).setFont("helvetica", "bold").setFontSize(9).text(clean(row.heading), x + 4, y + 10.5);
        } else {
          pdf.setTextColor("#152739").setFont("helvetica", "bold").setFontSize(size.font).text(row.label!, x, y + size.font, { lineHeightFactor: line / size.font });
          const detailY = y + row.label!.length * line;
          if (row.key) pdf.setTextColor("#456174").setFont("courier", "normal").setFontSize(7).text(row.key, x, detailY + 6);
          pdf.setTextColor("#152739").setFont("helvetica", "normal").setFontSize(size.font);
          if (row.choices) pdf.text(row.choices, x, detailY + 7 + size.font, { lineHeightFactor: line / size.font });
          if (row.comment) {
            const commentY = detailY + 7 + row.choices!.length * line;
            pdf.setFontSize(7).text("Comment", x, commentY + 8);
            pdf.setDrawColor("#587287").line(x + 34, commentY + 9, x + width, commentY + 9);
          }
          if (row.answer) pdf.text(row.answer, x, detailY + size.font, { lineHeightFactor: line / size.font });
          if (row.writing) pdf.setDrawColor("#587287").setLineWidth(.45).rect(x, detailY + 9, width, row.writing - 2);
        }
        y += row.height;
      }
    });
    pdf.setTextColor(navy).setFont("helvetica", "normal").setFontSize(8);
    pdf.text(data.worksheet ? "DASH paper worksheet" : "DASH visit recap. Full notes and photos are available in DASH.", margins, 768);
    pdf.text(`Page ${page + 1} of ${totalPages}`, pageWidth - margins, 768, { align: "right" });
  }
  return pdf;
}
