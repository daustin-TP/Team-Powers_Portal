import { Check, XCircle } from "lucide-react";

export type TemplateData = Record<string, string>;
type FieldType = "text" | "textarea" | "time" | "date" | "choice" | "rating";
export type TemplateField = { key: string; label: string; type?: FieldType; options?: string[]; placeholder?: string; helper?: string };
export type VisitTemplateSection = { key: string; label: string; intro?: string; fields: TemplateField[] };
export type VisitTemplate = { title: string; subtitle: string; sections: VisitTemplateSection[] };

const readiness = ["Meets Standard", "Needs Improvement", "Not Observed"];
const finalRating = ["Meets Standard", "Needs Improvement", "Unsatisfactory"];

const fields = (prefix: string, labels: string[], options = readiness): TemplateField[] => labels.map((label, index) => ({ key: `${prefix}_${index + 1}`, label, type: "rating", options }));

export const visitTemplates: Record<string, VisitTemplate> = {
  "Game Day visit": {
    title: "Game Day Sheet",
    subtitle: "Communication. Accountability. Celebration.",
    sections: [
      { key: "game_metrics", label: "Week-to-date results", fields: [
        { key: "wtd_sales", label: "Week-to-date sales" }, { key: "adt", label: "ADT" }, { key: "total_fl", label: "Total FL" },
        { key: "wait_load", label: "Wait & Load" }, { key: "variance", label: "Variance" },
      ] },
      { key: "game_prep", label: "Ready for the Rush (Prep) — 3:59 PM", intro: "Complete the preparation check before the rush begins.", fields: fields("game_prep", [
        "Cabinets and rail stocked and ready?", "Dough proofed and warming for rush?", "Aprons available and hanging?",
        "PRP forecast printed and highlighted — does it agree with sales?", "Bites, Pan, SCB, and Domino's ready according to PRP?",
        "Pizza sauce and sauce bottles ready?", "Position chart filled out and reviewed?", "Perfect crew image?", "Menus ready?",
        "Coke coolers stocked?", "Plenty of change available for rush?",
      ], ["Yes", "No"]) },
      { key: "game_goals", label: "Game Day goals", fields: [
        { key: "goal_sales", label: "Sales goal" }, { key: "goal_adt", label: "ADT goal" }, { key: "goal_load", label: "Load goal" },
        { key: "goal_wait", label: "Wait goal" }, { key: "goal_food_variance", label: "Food variance goal", placeholder: "Example: 1.0%" },
        { key: "game_notes", label: "Coaching notes / action needed", type: "textarea" },
      ] },
    ],
  },
  "Rush observation": {
    title: "Observation of the Rush",
    subtitle: "Observe the manager first, then coach the operation.",
    sections: [
      { key: "rush_details", label: "Visit details", fields: [
        { key: "person_in_charge", label: "Person in charge" },
        { key: "rush_start", label: "Observation start", type: "time" }, { key: "rush_end", label: "Observation end", type: "time" },
      ] },
      { key: "rush_product", label: "Product", fields: [{ key: "product_notes", label: "What was observed?", type: "textarea", placeholder: "Portioning, quality, bake, remakes, product flow…" }] },
      { key: "rush_service", label: "Service", fields: [{ key: "service_notes", label: "What was observed?", type: "textarea", placeholder: "Wait/load times, bottlenecks, positioning, customer experience…" }] },
      { key: "rush_image", label: "Image", fields: [{ key: "image_notes", label: "What was observed?", type: "textarea", placeholder: "Store readiness, uniforms, cleanliness, organization…" }] },
      { key: "rush_teamwork", label: "Teamwork", fields: [{ key: "teamwork_notes", label: "What was observed?", type: "textarea", placeholder: "Communication, manager leadership, teamwork, response under pressure…" }] },
      { key: "rush_debrief", label: "Debrief and follow-up", fields: [
        { key: "rush_worked", label: "What worked?", type: "textarea" }, { key: "rush_stuck", label: "Where did the team get stuck?", type: "textarea" },
        { key: "rush_change", label: "What will change next rush?", type: "textarea" },
      ] },
    ],
  },
  "Opening visit": {
    title: "Opening Visit Evaluation",
    subtitle: "Manager observation and coaching form.",
    sections: [
      { key: "opening_timeline", label: "Opening timeline", fields: [
        { key: "opening_manager", label: "Opening manager" }, { key: "supervisor_arrival", label: "Supervisor arrival", type: "time" },
        { key: "store_opening", label: "Store opening time", type: "time" }, { key: "lunch_from", label: "Lunch rush observation from", type: "time" },
        { key: "lunch_to", label: "Lunch rush observation to", type: "time" },
      ] },
      { key: "opening_readiness", label: "Exterior and store readiness", fields: fields("opening_ready", [
        "Parking lot clean and free of trash", "Sidewalks, entrances, and storefront clean", "Lobby and restrooms clean and stocked",
        "Store supplies and standard areas stocked", "Signage in place and visible", "Opening completed properly — lights, POS, and required systems",
      ]) },
      { key: "opening_food", label: "Food safety and product readiness", fields: fields("opening_food", [
        "No expired product", "Labels, dates, and rotation are correct", "Dough is at the proper temperature and quality",
        "Sauces stored properly", "Refrigeration temperatures checked and within standard", "Sanitizer prepared at correct concentration",
        "No product improperly held at room temperature",
      ]) },
      { key: "opening_prp", label: "Dough, PRP and projections", fields: fields("opening_prp", [
        "Projections printed and available", "PRP posted and being used", "Dough prepared and proofed", "Dough properly mixed and ready for the shift",
        "Quantities match projected needs",
      ]) },
      { key: "opening_equipment", label: "Equipment and technology", fields: fields("opening_equipment", [
        "All required equipment is functioning", "Oven, prep areas, makelines, warming equipment, and printers are ready", "Refrigeration is functioning",
        "Printers are working", "Computers, POS, and order systems are working", "Security and cameras checked and functioning",
      ]) },
      { key: "opening_stock", label: "Stocking and operational readiness", fields: fields("opening_stock", [
        "Prep list complete", "Cut table stocked", "Makeline ready", "Rack bins filled", "Soda cooler stocked and functioning",
        "Sides, snacks, utensils, and supplies stocked",
      ]) },
      { key: "opening_quality", label: "First-order product quality", fields: [
        { key: "first_order_rating", label: "First order", type: "choice", options: ["Great", "Good", "Remake"] },
        { key: "first_order_defects", label: "Defects observed", type: "text", placeholder: "Rim, size, portion, placement, bake…" },
        { key: "first_order_comments", label: "Comments", type: "textarea" },
      ] },
      { key: "opening_lunch", label: "Lunch rush readiness", fields: fields("opening_lunch", ["Properly staffed", "Team positioned and ready", "Team can handle an order increase"]) },
      { key: "opening_verification", label: "Inventory and money verification", fields: fields("opening_verify", [
        "Key inventory items spot-checked", "Inventory discrepancies addressed", "Inventory accurate and organized", "Previous night's money verified",
        "Deposits prepared and accounted for", "Money discrepancies addressed",
      ]) },
      { key: "opening_plan", label: "Manager plan and coaching", fields: [
        { key: "manager_has_plan", label: "Manager has a plan", type: "choice", options: ["Yes", "No"] }, { key: "manager_plan", label: "Plan details / notes", type: "textarea" },
        { key: "opening_supervisor_comments", label: "Supervisor comments", type: "textarea" }, { key: "opening_coaching", label: "Manager coaching notes", type: "textarea" },
        { key: "opening_actions", label: "Action plan — item, owner, and due date", type: "textarea" },
      ] },
    ],
  },
  "Closing visit": {
    title: "Closing Visit Evaluation",
    subtitle: "Closing manager observation and coaching form.",
    sections: [
      { key: "closing_timeline", label: "Closing timeline", fields: [
        { key: "closing_manager", label: "Closing manager" }, { key: "closing_arrival", label: "Supervisor arrival", type: "time" },
        { key: "scheduled_close", label: "Scheduled store closing", type: "time" }, { key: "last_order", label: "Last order received — all channels", type: "time" },
        { key: "last_delivery", label: "Last delivery order received", type: "time" }, { key: "last_completed", label: "Last order completed", type: "time" },
        { key: "team_finished", label: "Closing team finished / store ready", type: "time" }, { key: "closing_departure", label: "Supervisor departure", type: "time" },
      ] },
      { key: "closing_preclose", label: "Pre-close operations", intro: "Observe the final two to three hours before close.", fields: fields("closing_pre", [
        "Makeline remains operational and unbroken", "Required products and ingredients remain available", "Closing tasks begin without interfering with service",
        "Manager assigns closing responsibilities", "Staffing and positioning support business needs",
      ]) },
      { key: "closing_inventory", label: "Inventory verification", fields: fields("closing_inventory", [
        "Physical counts completed", "Discrepancies addressed", "Waste recorded", "FIFO rotation and storage followed", "Manager demonstrates inventory accountability",
      ]) },
      { key: "closing_food", label: "Food safety and product quality", fields: fields("closing_food", [
        "Handwashing and glove standards followed", "Temperatures and holding standards followed", "Product labeled and within expiration",
        "Surfaces and equipment cleaned and sanitized", "Pizzas meet standards", "Product quality maintained through final order",
      ]) },
      { key: "closing_leadership", label: "Time management and leadership", fields: fields("closing_lead", [
        "Manager delegates effectively", "Team remains productive without sacrificing service", "Tasks completed in a logical, efficient order",
        "Manager adjusts the plan when conditions change", "Manager leads instead of completing every task personally",
      ]) },
      { key: "closing_walkthrough", label: "Final walkthrough", fields: fields("closing_walk", [
        "Makeline and equipment cleaned", "Food stored, labeled, and rotated using FIFO", "Cut table, heat racks, and workstations ready",
        "Floors, trash, and restrooms complete", "Coke coolers and supplies ready", "Closing paperwork complete", "Store ready for opening",
      ], finalRating) },
      { key: "closing_recap", label: "Overall performance and follow-up", fields: [
        { key: "closing_overall", label: "Overall performance", type: "choice", options: finalRating },
        { key: "closing_well", label: "What the manager and team did well", type: "textarea" }, { key: "closing_improve", label: "What needs improvement", type: "textarea" },
        { key: "closing_action", label: "Action plan and follow-up", type: "textarea" }, { key: "closing_coaching", label: "Coaching discussion summary", type: "textarea" },
        { key: "closing_commitments", label: "Manager commitments", type: "textarea" },
        { key: "closing_return", label: "Another closing visit needed?", type: "choice", options: ["Yes", "No"] },
        { key: "closing_return_date", label: "Target follow-up date", type: "date" },
      ] },
    ],
  },
};

export const templateForVisit = (visitType: string) => visitTemplates[visitType] ?? null;
export const templateCompletion = (template: VisitTemplate | null, data: TemplateData) => {
  if (!template) return { complete: 0, total: 0, issues: 0 };
  const list = template.sections.flatMap((section) => section.fields);
  return {
    complete: list.filter((field) => Boolean(data[field.key]?.trim())).length,
    total: list.length,
    issues: list.filter((field) => /needs improvement|unsatisfactory|no$/i.test(data[field.key] ?? "")).length,
  };
};

export function VisitTemplateSectionForm({ section, data, onChange, disabled }: { section: VisitTemplateSection; data: TemplateData; onChange: (key: string, value: string) => void; disabled?: boolean }) {
  return <section className="visit-template-section">
    {section.intro && <p className="visit-template-intro">{section.intro}</p>}
    <div className="visit-template-fields">{section.fields.map((field) => <label key={field.key} className={field.type === "textarea" ? "wide" : ""}>
      <span>{field.label}</span>
      {field.helper && <small>{field.helper}</small>}
      {field.type === "textarea" ? <textarea rows={4} value={data[field.key] ?? ""} placeholder={field.placeholder} onChange={(event) => onChange(field.key, event.target.value)} disabled={disabled} />
        : field.type === "choice" || field.type === "rating" ? <div className="visit-template-options" role="group" aria-label={field.label}>{field.options?.map((option) => <button type="button" key={option} className={data[field.key] === option ? "selected" : ""} onClick={() => onChange(field.key, option)} disabled={disabled}>{/^yes$/i.test(option) && <Check size={14}/>} {/^no$/i.test(option) && <XCircle size={14}/>} {option}</button>)}</div>
        : <input type={field.type === "time" || field.type === "date" ? field.type : "text"} value={data[field.key] ?? ""} placeholder={field.placeholder} onChange={(event) => onChange(field.key, event.target.value)} disabled={disabled} />}
    </label>)}</div>
  </section>;
}
