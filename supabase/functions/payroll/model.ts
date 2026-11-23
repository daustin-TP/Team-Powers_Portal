export const sections = [
  { key: "pay", title: "Team Member Pay and Position Updates", types: ["PTO / Vacation", "Position Change / Promotion", "Pay Rate Change", "Additional Hours", "Shift Coverage Bonus"] },
  { key: "information", title: "Team Member Information Updates", types: ["Address Change", "Legal Name Change", "Direct Deposit Update"] },
  { key: "deductions", title: "Donations and Deductions", types: ["Partners Foundation Payroll Deduction"] },
  { key: "additional", title: "Additional Payroll Updates", types: ["Additional Payroll Update"] },
  { key: "recognition", title: "Management Bonuses", types: ["5 Star OA Bonus", "Food Safety Bonus", "Other Bonus", "Period Bonus"] },
] as const;
export type Entry = {
  section: string; type: string; employee: string; employee_id: string;
  effective_date: string; end_date: string; day_portion: string;
  position: string; new_position: string; new_name: string; new_address: string;
  amount: string; hours: string; acknowledged: boolean; details: string;
  attachment_path: string; attachment_name: string; attachment_type: string;
  source_request_id: string;
};
const textKeys = ["section","type","employee","employee_id","effective_date","end_date","day_portion","position","new_position","new_name","new_address","amount","hours","details","attachment_path","attachment_name","attachment_type","source_request_id"] as const;
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
    const normalizedSection = entry.type === "Additional Payroll Update" ? "additional" : String(entry.section ?? "");
    const section = sections.find(s => s.key === normalizedSection);
    if (!section || !(section.types as readonly string[]).includes(String(entry.type ?? ""))) throw Error("Choose a valid payroll section and update type.");
    if (section.key === "recognition" && !["supervisor","admin"].includes(role)) throw Error("Management bonuses are available only to District Managers and administrators.");
    const clean = Object.fromEntries(textKeys.map(key => [key, String(entry[key] ?? "").trim()])) as unknown as Entry;
    clean.section = normalizedSection;
    clean.acknowledged = entry.acknowledged === true;
    if (Object.values(clean).some(v => typeof v === "string" && v.length > 2000)) throw Error(`Entry ${index + 1} is too long.`);
    for (const key of ["amount", "hours"] as const) if (clean[key] && (!Number.isFinite(Number(clean[key])) || Number(clean[key]) < 0)) throw Error("Amounts and hours must be positive numbers or zero.");
    if (!complete) return clean;
    if (clean.type !== "Additional Payroll Update") required(clean.employee, `${clean.type}: enter the team member name exactly as it appears on payroll.`);
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
      case "Additional Payroll Update":
        if (clean.effective_date) requireDate();
        required(clean.details,"Additional Payroll Update: enter a description of the addition or correction."); break;
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
  const date = (value: string) => value ? new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "2-digit", day: "2-digit", year: "numeric" }) : "";
  const facts = [e.effective_date&&`Date: ${date(e.effective_date)}`,e.end_date&&e.end_date!==e.effective_date&&`Through: ${date(e.end_date)}`,e.day_portion&&`Usage: ${e.day_portion}`,e.position&&`Position: ${e.position}`,e.new_position&&`New position: ${e.new_position}`,e.new_name&&`New legal name: ${e.new_name}`,e.new_address&&`New address: ${e.new_address}`,e.amount&&`Amount / rate: $${Number(e.amount).toFixed(2)}`,e.hours&&`Hours: ${e.hours}`,e.acknowledged&&"Required documentation: confirmed emailed",e.attachment_name&&`DASH attachment: ${e.attachment_name}`].filter(Boolean);
  const employee = e.employee ? `${e.employee}${e.employee_id ? ` (${e.employee_id})` : ""}` : "General payroll update";
  const detailLabel = e.type === "Additional Payroll Update" ? "Description" : "Notes";
  const followup = e.type === "Direct Deposit Update"
    ? "[ADMIN: ADD OR ATTACH THE SECURE DIRECT-DEPOSIT INFORMATION BEFORE FORWARDING]"
    : e.type === "Legal Name Change"
      ? "[ADMIN: ATTACH THE REQUIRED LEGAL NAME-CHANGE DOCUMENTATION BEFORE FORWARDING]"
      : e.type === "Partners Foundation Payroll Deduction"
        ? "[ADMIN: ATTACH THE PARTNERS FOUNDATION FORM OR PHOTO BEFORE FORWARDING]"
        : "";
  return [`• ${employee}`,...facts.map(fact=>`  ${fact}`),e.details?`  ${detailLabel}: ${e.details}`:"",followup?`  ${followup}`:""].filter(Boolean).join("\n");
}

const payrollCompanies = [
  { name: "Powers Pizza", stores: ["Sparta", "North Cookeville", "North", "Manchester", "Smithville", "Fairfield Glade", "Baxter"] },
  { name: "Pizza Power", stores: ["Dunlap", "South Cookeville", "South", "Livingston", "Algood", "Monterey", "Jamestown"] },
] as const;
const payrollCategories = [
  { title: "PTO / VACATION", types: ["PTO / Vacation"] },
  { title: "POSITION CHANGE / PROMOTION", types: ["Position Change / Promotion"] },
  { title: "PAY RATE CHANGES", types: ["Pay Rate Change"] },
  { title: "ADDITIONAL HOURS", types: ["Additional Hours"] },
  { title: "SHIFT COVERAGE BONUS", types: ["Shift Coverage Bonus"] },
  { title: "ADDRESS CHANGE", types: ["Address Change"] },
  { title: "LEGAL NAME CHANGE", types: ["Legal Name Change"] },
  { title: "DIRECT DEPOSIT UPDATES", types: ["Direct Deposit Update"] },
  { title: "PARTNERS FOUNDATION PAYROLL DEDUCTION", types: ["Partners Foundation Payroll Deduction"] },
  { title: "ADDITIONAL PAYROLL UPDATES", types: ["Additional Payroll Update"] },
  { title: "MANAGEMENT BONUSES", types: ["5 Star OA Bonus", "Food Safety Bonus", "Other Bonus", "Period Bonus"] },
] as const;
const normalizedStore = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
function companyForStore(storeName: string) {
  const normalized = normalizedStore(storeName);
  return payrollCompanies.find(company => company.stores.some(store => normalizedStore(store) === normalized))?.name ?? "LLC NOT ASSIGNED";
}
function companyStoreOrder(companyName: string, storeName: string) {
  const company = payrollCompanies.find(item => item.name === companyName);
  const index = company?.stores.findIndex(store => normalizedStore(store) === normalizedStore(storeName)) ?? -1;
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}
export function emailBody(due: string, submissions: { store_name: string; entries: Entry[] }[]) {
  const date = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "2-digit", day: "2-digit", year: "numeric" });
  const grouped = [...payrollCompanies.map(company => company.name), "LLC NOT ASSIGNED"].map(companyName => {
    const stores = submissions
      .filter(store => companyForStore(store.store_name) === companyName)
      .sort((a,b) => companyStoreOrder(companyName,a.store_name)-companyStoreOrder(companyName,b.store_name) || a.store_name.localeCompare(b.store_name));
    const categoryBlocks = payrollCategories.map(category => {
      const storeBlocks = stores.map(store => {
        const entries = store.entries.filter(entry => (category.types as readonly string[]).includes(entry.type));
        return entries.length ? `${store.store_name}\n${entries.map(entryText).join("\n")}` : "";
      }).filter(Boolean);
      return storeBlocks.length ? `${category.title}\n${storeBlocks.join("\n\n")}` : "";
    }).filter(Boolean);
    return categoryBlocks.length ? `${companyName.toUpperCase()}\n${"=".repeat(companyName.length)}\n\n${categoryBlocks.join("\n\n")}` : "";
  }).filter(Boolean);
  return `PAYROLL UPDATE\nDue: ${date(due)} at 4:00 p.m. Central\nPay period: ${date(addDays(due,-14))} through ${date(addDays(due,-1))}\n\n${grouped.join("\n\n\n")}`;
}

export function reminderBody(due: string, name: string, storeNames: string, slot: "morning" | "afternoon") {
  const reminderTime = slot === "morning" ? "9:00 a.m." : "2:00 p.m.";
  return `Hello ${name},\n\nPayroll has not been sent in for review for ${storeNames}.\nPlease submit through DASH-OS by 4:00 p.m. Central today (${due}).\n\nThis is the ${reminderTime} Payroll Monday reminder.`;
}

export function emailHtml(title: string, text: string, portalUrl: string) {
  const escaped = (value: string) => value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  const body = escaped(text);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#eef3f8;font-family:Arial,Helvetica,sans-serif;color:#10233d">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f8"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #dce5ef;box-shadow:0 8px 24px rgba(15,35,60,.08)">
<tr><td style="background:#07111f;padding:24px 28px"><div style="font-size:27px;font-style:italic;font-weight:900;letter-spacing:-1px"><span style="color:#ff2828">DA</span><span style="color:#168fff">SH</span><span style="color:#fff">-OS</span></div><div style="color:#a9bbcf;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;margin-top:5px">Team Powers · Payroll</div></td></tr>
<tr><td style="padding:28px"><div style="font-size:12px;color:#0878c9;font-weight:800;letter-spacing:.12em;text-transform:uppercase">Payroll update</div><h1 style="margin:8px 0 10px;font-size:25px;line-height:1.25;color:#071a33">${escaped(title)}</h1><p style="margin:0 0 22px;color:#65778b;font-size:13px">Copy-ready summary. Complete any bracketed admin placeholders, then remove the brackets before forwarding.</p><pre style="margin:0;padding:18px;background:#fff;border:1px solid #dce5ef;border-radius:8px;color:#10233d;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;white-space:pre-wrap;word-break:break-word">${body}</pre><div style="margin-top:26px"><a href="${escaped(portalUrl)}" style="display:inline-block;background:#0878c9;color:#fff;text-decoration:none;font-size:14px;font-weight:800;padding:12px 20px;border-radius:8px">Open Payroll in DASH-OS</a></div></td></tr>
<tr><td style="background:#f7fafc;border-top:1px solid #e3eaf2;padding:18px 28px;color:#718096;font-size:11px;line-height:1.5">Sent securely by DASH-OS for Team Powers.</td></tr>
</table></td></tr></table></body></html>`;
}
