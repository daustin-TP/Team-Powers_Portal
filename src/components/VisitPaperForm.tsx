import type { TemplateField } from "./VisitTemplateForm";

export type PaperSection = { key: string; label: string; fields: TemplateField[] };

function sectionPages(sections: PaperSection[]) {
  const columns: PaperSection[][] = [[]];
  let height = 0;
  const columnLimit = 565;
  for (const section of sections) {
    const fields: TemplateField[] = [...section.fields, { key: `visitNotes.${section.key}`, label: "Visit notes", type: "textarea" }];
    let block: PaperSection | undefined;
    for (const field of fields) {
      const rowHeight = field.type === "textarea" ? 58 : field.options ? 38 : 35;
      if (height + rowHeight + (block ? 0 : 25) > columnLimit) {
        columns.push([]);
        height = 0;
        block = undefined;
      }
      if (!block) {
        block = { ...section, label: field === fields[0] ? section.label : `${section.label} (continued)`, fields: [] };
        columns[columns.length - 1].push(block);
        height += 25;
      }
      block.fields.push(field);
      height += rowHeight;
    }
  }
  return Array.from({ length: Math.ceil(columns.length / 2) }, (_, index) => columns.slice(index * 2, index * 2 + 2));
}

export default function VisitPaperForm({ title, visitType, sections, store, date, time }: {
  title: string;
  visitType: string;
  sections: PaperSection[];
  store: string;
  date: string;
  time: string;
}) {
  const pages = sectionPages(sections);
  return <div className="visit-paper-source" aria-hidden="true">{pages.map((page, index) =>
    <article className="visit-paper-page" key={index}>
      <header>
        <p>TEAM POWERS · DASH · FORM V2 · PAGE {index + 1} OF {pages.length}</p>
        <h1>{title}</h1>
        {title !== visitType && <p>{visitType}</p>}
        <p>Store {store || "________________"} · Date {date || "____________"} · Time {time || "__________"}</p>
      </header>
      <p>Print clearly in dark ink. Mark one box per question and leave skipped answers blank. Photograph the entire page with its header visible.</p>
      <div className="visit-paper-columns">{page.map((column, columnIndex) => <div key={columnIndex}>{column.map(section => <section key={section.key}>
      <h2>{section.label}</h2>
      {section.fields.map(field => <div className="visit-paper-field" key={field.key}>
        <strong>{field.label}</strong><code>{field.key}</code>
        {field.options ? <div className="visit-paper-options">{field.options.map(option =>
          <span key={option}><i/> {option}</span>)}</div> :
          <div className={field.type === "textarea" ? "visit-paper-writing long" : "visit-paper-writing"}/>}
      </div>)}
      </section>)}</div>)}</div>
    </article>)}</div>;
}
