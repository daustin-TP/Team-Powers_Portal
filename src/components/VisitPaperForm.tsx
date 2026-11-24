import type { TemplateField } from "./VisitTemplateForm";

export type PaperSection = { key: string; label: string; fields: TemplateField[] };

function sectionPages(sections: PaperSection[]) {
  return sections.flatMap(section => {
    const pages: TemplateField[][] = [[]];
    let used = 0;
    const limit = 20;
    for (const field of section.fields) {
      const units = field.type === "textarea" ? 4 : 2;
      if (used + units > limit) {
        pages.push([]);
        used = 0;
      }
      pages[pages.length - 1].push(field);
      used += units;
    }
    return pages.map((fields, index) => ({ ...section, fields, part: index + 1, parts: pages.length }));
  });
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
    <article className="visit-paper-page" key={`${page.key}:${page.part}`}>
      <header>
        <p>TEAM POWERS · DASH · FORM V1 · PAGE {index + 1} OF {pages.length}</p>
        <h1>{title}</h1>
        <p>{visitType} · Section {page.key}{page.parts > 1 ? ` · Part ${page.part} of ${page.parts}` : ""}</p>
        <p>Store {store || "________________"} · Date {date || "____________"} · Time {time || "__________"}</p>
      </header>
      <h2>{page.label}</h2>
      <p>Print clearly in dark ink. Mark one box per question and leave skipped answers blank. Photograph the entire page with its header visible.</p>
      {page.fields.map(field => <div className="visit-paper-field" key={field.key}>
        <strong>{field.label}</strong><code>{field.key}</code>
        {field.options ? <div className="visit-paper-options">{field.options.map(option =>
          <span key={option}><i/> {option}</span>)}</div> :
          <div className={field.type === "textarea" ? "visit-paper-writing long" : "visit-paper-writing"}/>}
      </div>)}
      {page.part === page.parts && <div className="visit-paper-field">
        <strong>Visit notes</strong><code>visitNotes.{page.key}</code>
        <div className="visit-paper-writing long"/>
      </div>}
    </article>)}</div>;
}
