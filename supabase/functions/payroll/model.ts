export const sections = [
  { key: "pay", title: "Team Member Pay and Position Updates", types: ["PTO / Vacation", "Position Change / Promotion", "Pay Rate Change", "Additional Hours", "Shift Coverage Bonus"] },
  { key: "information", title: "Team Member Information Updates", types: ["Address Change", "Legal Name Change", "Direct Deposit Update"] },
  { key: "deductions", title: "Donations and Deductions", types: ["Partners Foundation Payroll Deduction"] },
  { key: "recognition", title: "Leadership Bonuses", types: ["5 Star OA Bonus", "Food Safety Bonus", "Other Bonus", "Period Bonus"] },
] as const;
export type Entry = {
  section: string; type: string; employee: string; employee_id: string;
  effective_date: string; end_date: string; day_portion: string;
  position: string; new_position: string; new_name: string; new_address: string;
  amount: string; hours: string; acknowledged: boolean; details: string;
  attachment_path: string; attachment_name: string; attachment_type: string;
};
const textKeys = ["section","type","employee","employee_id","effective_date","end_date","day_portion","position","new_position","new_name","new_address","amount","hours","details","attachment_path","attachment_name","attachment_type"] as const;
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
const required = (condition: unknown, message: string) => { if (!condition) throw Error(message); };
const positive = (value: string, label: string) => required(value && Number.isFinite(Number(value)) && Number(value) > 0, `${label} must be greater than zero.`);
export function addDays(date: string, days: number) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export function validCycle(date: string) {
  return validDate(date) && (Date.parse(date) - Date.parse("2026-10-19")) % (14 * 86400000) === 0;
}
export function currentCycle(now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const days = Math.ceil((Date.parse(today) - Date.parse("2026-10-19")) / (14 * 86400000));
  return addDays("2026-10-19", days * 14);
}
export function validateEntries(entries: unknown, complete = true, due = "", role = "manager"): Entry[] {
  if (!Array.isArray(entries) || entries.length > 250) throw Error("Use up to 250 entries per store.");
  return entries.map((raw, index) => {
    const entry = raw as Record<string, unknown>;
    const section = sections.find(s => s.key === entry.section);
    if (!section || !(section.types as readonly string[]).includes(String(entry.type ?? ""))) throw Error("Choose a valid payroll section and update type.");
    if (section.key === "recognition" && !["supervisor","admin"].includes(role)) throw Error("Leadership bonuses are available only to supervisors and administrators.");
    const clean = Object.fromEntries(textKeys.map(key => [key, String(entry[key] ?? "").trim()])) as unknown as Entry;
    clean.acknowledged = entry.acknowledged === true;
    if (Object.values(clean).some(v => typeof v === "string" && v.length > 2000)) throw Error(`Entry ${index + 1} is too long.`);
    for (const key of ["amount", "hours"] as const) if (clean[key] && (!Number.isFinite(Number(clean[key])) || Number(clean[key]) < 0)) throw Error("Amounts and hours must be positive numbers or zero.");
    if (!complete) return clean;
    required(clean.employee, `${clean.type}: enter the team member name exactly as it appears on payroll.`);
    const requireDate = (value = clean.effective_date, label = "Effective date") => required(validDate(value), `${clean.type}: enter a valid ${label.toLowerCase()}.`);
    switch (clean.type) {
      case "PTO / Vacation":
        requireDate(clean.effective_date,"start date"); requireDate(clean.end_date,"end date");
        required(clean.end_date >= clean.effective_date,"PTO / Vacation: the end date cannot be before the start date.");
        required(["Full day","Half day"].includes(clean.day_portion),"PTO / Vacation: choose full day or half day."); break;
      case "Position Change / Promotion":
        requireDate(); required(clean.new_position,"Position Change / Promotion: enter the new position."); positive(clean.amount,"New hourly rate"); break;
      case "Pay Rate Change": {
        requireDate(); required(clean.position,"Pay Rate Change: enter the position being changed."); positive(clean.amount,"New hourly rate");
        required((due ? [due,addDays(due,-14)] : []).includes(clean.effective_date),"Pay Rate Change: effective date must be the start of the current or previous pay period."); break;
      }
      case "Additional Hours":
        requireDate(clean.effective_date,"work date"); required(clean.position,"Additional Hours: enter the position for the added time."); positive(clean.hours,"Additional hours"); required(clean.details,"Additional Hours: notes / reason are required."); break;
      case "Shift Coverage Bonus":
        requireDate(clean.effective_date,"bonus date"); positive(clean.amount,"Bonus amount"); required(clean.details,"Shift Coverage Bonus: notes / reason are required."); break;
      case "Address Change": required(clean.new_address,"Address Change: enter the new address."); break;
      case "Legal Name Change": required(clean.new_name,"Legal Name Change: enter the new legal name."); required(clean.acknowledged,"Legal Name Change: confirm the legal paperwork was emailed."); break;
      case "Direct Deposit Update": required(clean.acknowledged,"Direct Deposit Update: confirm the new information was emailed securely."); break;
      case "Partners Foundation Payroll Deduction":
        positive(clean.amount,"Per-pay-period deduction"); required(clean.attachment_path && clean.attachment_name,"Partners Foundation Payroll Deduction: attach the completed form or a photo."); break;
      default:
        if (section.key === "recognition") { requireDate(); required(clean.position,`${clean.type}: enter the team member position.`); positive(clean.amount,"Bonus amount"); }
    }
    return clean;
  });
}
function entryText(e: Entry) {
  const facts = [e.effective_date&&`Date: ${e.effective_date}`,e.end_date&&e.end_date!==e.effective_date&&`Through: ${e.end_date}`,e.day_portion&&`Usage: ${e.day_portion}`,e.position&&`Position: ${e.position}`,e.new_position&&`New position: ${e.new_position}`,e.new_name&&`New legal name: ${e.new_name}`,e.new_address&&`New address: ${e.new_address}`,e.amount&&`Amount / rate: $${Number(e.amount).toFixed(2)}`,e.hours&&`Hours: ${e.hours}`,e.acknowledged&&"Required documentation: confirmed emailed",e.attachment_name&&`Attachment: ${e.attachment_name}`].filter(Boolean).join(" | ");
  return `${e.type} — ${e.employee}${e.employee_id ? ` (${e.employee_id})` : ""}\n${facts||"No additional fields"}${e.details?`\nNotes: ${e.details}`:""}`;
}
export function emailBody(due: string, submissions: { store_name: string; entries: Entry[] }[]) {
  return `PAYROLL — due ${due} at 4:00 p.m. America/Chicago\nPay period: ${addDays(due,-14)} through ${addDays(due,-1)}\n\n` +
    sections.map(section => `${section.title.toUpperCase()}\n\n` + [...submissions].sort((a,b)=>a.store_name.localeCompare(b.store_name)).map(store =>
      `${store.store_name}\n` + (store.entries.filter(e=>e.section===section.key).map(entryText).join("\n\n") || "No changes reported.") + "\n"
    ).join("\n")).join("\n\n");
}
