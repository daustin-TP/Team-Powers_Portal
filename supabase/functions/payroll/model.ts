export const sections = [
  { key: "pay", title: "Team Member Pay and Position Updates", types: ["PTO / Vacation", "Position Change / Promotion", "Pay Rate Change", "Additional Hours", "Shift Coverage Bonus"] },
  { key: "information", title: "Team Member Information Updates", types: ["Address Change", "Legal Name Change", "Direct Deposit Update"] },
  { key: "deductions", title: "Donations and Deductions", types: ["Partners Foundation Payroll Deduction"] },
  { key: "recognition", title: "Operations Assessment Recognition", types: ["5 Star OA Bonus", "Food Safety Bonus", "Other Bonus", "Period Bonus"] },
] as const;
export type Entry = { section: string; type: string; employee: string; employee_id: string; effective_date: string; amount: string; hours: string; details: string };
export function addDays(date: string, days: number) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
export function validCycle(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date && (Date.parse(date) - Date.parse("2026-10-19")) % (14 * 86400000) === 0;
}
export function currentCycle(now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const days = Math.ceil((Date.parse(today) - Date.parse("2026-10-19")) / (14 * 86400000));
  return addDays("2026-10-19", days * 14);
}
export function validateEntries(entries: unknown, complete = true): Entry[] {
  if (!Array.isArray(entries) || entries.length > 250) throw Error("Use up to 250 entries per store.");
  return entries.map((entry) => {
    const section = sections.find(s => s.key === entry.section);
    if (!section || !(section.types as readonly string[]).includes(entry.type)) throw Error("Choose a valid payroll section and update type.");
    const clean = Object.fromEntries(["section","type","employee","employee_id","effective_date","amount","hours","details"].map(key => [key, String(entry[key] ?? "").trim()])) as Entry;
    if ((complete && (!clean.employee || !clean.effective_date)) || (clean.effective_date && (!/^\d{4}-\d{2}-\d{2}$/.test(clean.effective_date) || !Number.isFinite(Date.parse(clean.effective_date)) || new Date(clean.effective_date).toISOString().slice(0,10) !== clean.effective_date))) throw Error("Each entry needs an employee name and valid effective date.");
    if (Object.values(clean).some(v => v.length > 2000)) throw Error("An entry is too long.");
    for (const key of ["amount", "hours"] as const) if (clean[key] && (!Number.isFinite(Number(clean[key])) || Number(clean[key]) < 0)) throw Error("Amounts and hours must be positive numbers or zero.");
    if (complete && !clean.details) throw Error("Describe each requested change.");
    return clean;
  });
}
export function emailBody(due: string, submissions: { store_name: string; entries: Entry[] }[]) {
  return `PAYROLL — due ${due} at 4:00 p.m. America/Chicago\nPay period: ${addDays(due,-14)} through ${addDays(due,-1)}\n\n` +
    sections.map(section => `${section.title.toUpperCase()}\n\n` + [...submissions].sort((a,b)=>a.store_name.localeCompare(b.store_name)).map(store =>
      `${store.store_name}\n` + (store.entries.filter(e=>e.section===section.key).map(e =>
        `${e.type} — ${e.employee}${e.employee_id ? ` (${e.employee_id})` : ""}\nEffective: ${e.effective_date}${e.amount ? ` | Amount / rate: $${e.amount}` : ""}${e.hours ? ` | Hours: ${e.hours}` : ""}\n${e.details}`).join("\n\n") || "No changes reported.") + "\n"
    ).join("\n")).join("\n\n");
}
