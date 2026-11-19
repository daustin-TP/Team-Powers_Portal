import { templateForVisit, type TemplateData } from "./VisitTemplateForm";

type SummaryRow = { label: string; value: string };
export type PrintableVisitForm = {
  visitType: string;
  templateData: TemplateData;
  managerName: string;
  visitDate: string;
  visitTime: string;
  goals: { posted: string; needsAdjustment: string; onTrack: string };
  keyWins: string[];
  opportunities: string[];
  followUps: Array<{ item: string; owner: string; dueDate: string; completed: boolean }>;
};

const displayDate = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : "Not entered";
const displayTime = (value: string) => value ? new Date(`2000-01-01T${value}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "Not entered";
const printableValue = (value: string | undefined) => value?.trim() || "—";

export default function VisitPrintRecap({ form, store, supervisor, status, completion, photoCount, genericRows }: { form: PrintableVisitForm; store: string; supervisor: string; status: string; completion: number; photoCount: number; genericRows: SummaryRow[] }) {
  const template = templateForVisit(form.visitType);
  const theme = form.visitType.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return <article className={`visit-print-sheet visit-print-${theme}`} aria-hidden="true">
    <header className="visit-print-header"><img src="/team-powers-logo.png" alt="Team Powers"/><div><p>TEAM POWERS · DASH-OS</p><h1>{template?.title ?? "Area Supervisor Visit Recap"}</h1><span>{template?.subtitle ?? "Communication · Accountability · Celebration"}</span></div><strong>{status}</strong></header>
    <section className="visit-print-meta"><p><b>Store</b><span>{store}</span></p><p><b>Date</b><span>{displayDate(form.visitDate)}</span></p><p><b>Visit time</b><span>{displayTime(form.visitTime)}</span></p><p><b>Manager / person in charge</b><span>{form.managerName || form.templateData.person_in_charge || form.templateData.opening_manager || form.templateData.closing_manager || "Not entered"}</span></p><p><b>Area Supervisor</b><span>{supervisor}</span></p><p><b>Record</b><span>{completion}% complete · {photoCount} photo{photoCount === 1 ? "" : "s"}</span></p></section>
    {template ? <div className="visit-print-sections">{template.sections.map((section) => <section key={section.key}><h2>{section.label}</h2><div>{section.fields.map((field) => <p key={field.key} className={field.type === "textarea" ? "narrative" : ""}><b>{field.label}</b><span className={/needs improvement|unsatisfactory|^no$/i.test(form.templateData[field.key] ?? "") ? "flagged" : ""}>{printableValue(form.templateData[field.key])}</span></p>)}</div></section>)}</div> : <div className="visit-print-sections generic">
      <section><h2>Visit checks</h2><div>{genericRows.map((row) => <p key={row.label}><b>{row.label}</b><span>{row.value}</span></p>)}</div></section>
      <section><h2>Store goals</h2><div><p><b>Goals posted and updated</b><span>{form.goals.posted || "—"}</span></p><p className="narrative"><b>Goals needing adjustment</b><span>{form.goals.needsAdjustment || "—"}</span></p><p className="narrative"><b>Goals on track</b><span>{form.goals.onTrack || "—"}</span></p></div></section>
      <section><h2>Wins and opportunities</h2><div><p className="narrative"><b>Key wins</b><span>{form.keyWins.filter(Boolean).join(" · ") || "—"}</span></p><p className="narrative"><b>Coaching opportunities</b><span>{form.opportunities.filter(Boolean).join(" · ") || "—"}</span></p></div></section>
      <section><h2>Follow-up</h2><div>{form.followUps.filter((item) => item.item || item.owner || item.dueDate).map((item, index) => <p key={index}><b>{item.item || `Follow-up ${index + 1}`}</b><span>{item.owner || "No owner"} · {item.dueDate ? displayDate(item.dueDate) : "No due date"}{item.completed ? " · Complete" : ""}</span></p>)}{!form.followUps.some((item) => item.item || item.owner || item.dueDate) && <p><b>No follow-up entered</b><span>—</span></p>}</div></section>
    </div>}
    <footer><span>Generated from the permanent DASH visit record</span><span>Photos remain available securely in DASH</span><b>Communication · Accountability · Celebration</b></footer>
  </article>;
}
