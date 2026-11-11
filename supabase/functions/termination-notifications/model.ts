export function uniqueEmails(values: string[]) {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))];
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
}[character] ?? character));

export function terminationEmailCopy(input: {
  employeeName: string;
  storeName: string;
  effectiveDate: string;
  reason: string;
  submittedBy: string;
  portalUrl: string;
  testMode: boolean;
}) {
  const prefix = input.testMode ? "[TEST] " : "";
  const subject = `${prefix}Employee termination reported — ${input.employeeName} · ${input.storeName}`;
  const text = [
    input.testMode ? "TEST MODE — this notification has not been sent to the outside HR provider." : "A termination has been reported in DASH-OS.",
    "",
    `Employee: ${input.employeeName}`,
    `Store: ${input.storeName}`,
    `Effective date: ${input.effectiveDate}`,
    `Reason: ${input.reason || "See confidential HR Action Log"}`,
    `Submitted by: ${input.submittedBy}`,
    "",
    `Open the confidential record in DASH-OS: ${input.portalUrl}`,
  ].join("\n");
  const banner = input.testMode
    ? `<div style="padding:12px 16px;background:#fff4d6;border:1px solid #f4c95d;border-radius:8px;color:#6c4b00;font-weight:700;margin-bottom:18px">TEST MODE — the outside HR provider did not receive this message.</div>`
    : "";
  const rows = [
    ["Employee", input.employeeName], ["Store", input.storeName], ["Effective date", input.effectiveDate],
    ["Termination reason", input.reason || "See confidential HR Action Log"], ["Submitted by", input.submittedBy],
  ].map(([label, value]) => `<tr><td style="padding:10px 12px;color:#5f6f82;border-bottom:1px solid #e6edf4;width:34%;font-size:13px;text-transform:uppercase;letter-spacing:.04em">${escapeHtml(label)}</td><td style="padding:10px 12px;color:#102a43;border-bottom:1px solid #e6edf4;font-weight:700">${escapeHtml(value)}</td></tr>`).join("");
  const html = `<div style="font-family:Arial,sans-serif;background:#f4f7fb;padding:24px;color:#102a43"><div style="max-width:680px;margin:auto;background:white;border:1px solid #d9e2ec;border-radius:14px;overflow:hidden"><div style="padding:22px 26px;background:#07111d;color:white"><div style="font-size:12px;letter-spacing:.14em;color:#49a9ff;font-weight:800">DASH-OS · CONFIDENTIAL HR</div><h1 style="margin:7px 0 0;font-size:24px">Termination report received</h1></div><div style="padding:24px 26px">${banner}<p style="margin:0 0 18px;color:#52667a">A permanent termination record was submitted and the scheduling roster was updated.</p><table style="width:100%;border-collapse:collapse;border:1px solid #e6edf4;border-radius:8px">${rows}</table><p style="margin:22px 0 0"><a href="${escapeHtml(input.portalUrl)}" style="display:inline-block;padding:12px 18px;background:#087fdb;color:white;text-decoration:none;border-radius:8px;font-weight:700">Review securely in DASH-OS</a></p><p style="margin:18px 0 0;color:#7b8794;font-size:12px">This email contains limited information. Full confidential notes remain secured inside DASH-OS.</p></div></div></div>`;
  return { subject, text, html };
}
