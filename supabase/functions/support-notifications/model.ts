export type SupportEvent = "submitted" | "completed";
export type SupportArea = "technology" | "maintenance";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function brandedEmail(input: {
  areaName: string;
  title: string;
  storeName: string;
  severity: string;
  actionLine: string;
  description: string;
  stepsTaken?: string;
  externalTicketNumber?: string;
  createdAt?: string;
  photoAttached?: boolean;
  photoAvailableInDash?: boolean;
  portalUrl: string;
}) {
  const severityColors: Record<string, { background: string; color: string }> = {
    green: { background: "#dcfce7", color: "#166534" },
    yellow: { background: "#fef3c7", color: "#92400e" },
    red: { background: "#fee2e2", color: "#991b1b" },
  };
  const colors = severityColors[input.severity.toLowerCase()] ?? { background: "#e5edf5", color: "#243b53" };
  const detail = (label: string, value: string) => `<tr><td style="padding:7px 12px 7px 0;color:#64748b;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:7px 0;color:#10233d;font-size:14px;font-weight:600">${escapeHtml(value)}</td></tr>`;
  const created = input.createdAt
    ? new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" }).format(new Date(input.createdAt))
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#eef3f8;font-family:Arial,Helvetica,sans-serif;color:#10233d">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(input.title)} for ${escapeHtml(input.storeName)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f8"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #dce5ef;box-shadow:0 8px 24px rgba(15,35,60,.08)">
<tr><td style="background:#07111f;padding:24px 28px"><div style="font-size:27px;font-style:italic;font-weight:900;letter-spacing:-1px"><span style="color:#ff2828">DA</span><span style="color:#168fff">SH</span><span style="color:#fff">-OS</span></div><div style="color:#a9bbcf;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;margin-top:5px">Team Powers · ${escapeHtml(input.areaName)}</div></td></tr>
<tr><td style="padding:28px">
<div style="font-size:12px;color:#0878c9;font-weight:800;letter-spacing:.12em;text-transform:uppercase">${escapeHtml(input.areaName)} update</div>
<h1 style="margin:8px 0 6px;font-size:25px;line-height:1.25;color:#071a33">${escapeHtml(input.title)}</h1>
<p style="margin:0 0 22px;color:#52657b;font-size:15px">${escapeHtml(input.storeName)}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f7fafc;border:1px solid #e3eaf2;border-radius:10px;margin-bottom:20px"><tr><td style="padding:14px 16px"><table role="presentation" cellspacing="0" cellpadding="0">
${detail("Store", input.storeName)}${detail("Activity", input.actionLine)}${created ? detail("Submitted", `${created} CT`) : ""}${input.externalTicketNumber ? detail("Related ticket", input.externalTicketNumber) : ""}
</table><span style="display:inline-block;margin-top:8px;padding:5px 10px;border-radius:999px;background:${colors.background};color:${colors.color};font-size:12px;font-weight:800;text-transform:uppercase">${escapeHtml(input.severity)} priority</span></td></tr></table>
<div style="font-size:12px;color:#64748b;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:7px">Request details</div>
<div style="padding:16px;background:#f8fbfe;border-left:4px solid #168fff;border-radius:4px;color:#10233d;font-size:15px;line-height:1.55;white-space:pre-wrap">${escapeHtml(input.description)}</div>
${input.stepsTaken ? `<div style="font-size:12px;color:#64748b;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin:20px 0 7px">Steps already taken</div><div style="color:#334e68;font-size:14px;line-height:1.55;white-space:pre-wrap">${escapeHtml(input.stepsTaken)}</div>` : ""}
${input.photoAttached ? `<div style="margin-top:20px;padding:12px 14px;background:#eff8ff;border-radius:8px;color:#075985;font-size:13px;font-weight:700">&#128247; The submitted photo is attached to this email.</div>` : ""}
${input.photoAvailableInDash ? `<div style="margin-top:12px;padding:12px 14px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;color:#9a3412;font-size:13px;font-weight:700">&#128247; An additional photo was too large to attach, but it was saved successfully and is available inside DASH-OS.</div>` : ""}
<div style="margin-top:26px"><a href="${escapeHtml(input.portalUrl)}" style="display:inline-block;background:#0878c9;color:#fff;text-decoration:none;font-size:14px;font-weight:800;padding:12px 20px;border-radius:8px">Open request in DASH-OS</a></div>
</td></tr>
<tr><td style="background:#f7fafc;border-top:1px solid #e3eaf2;padding:18px 28px;color:#718096;font-size:11px;line-height:1.5">Sent securely by DASH-OS for Team Powers. Reply to your normal Team Powers contact if follow-up is needed.</td></tr>
</table></td></tr></table></body></html>`;
}

export function supportNotificationCopy(input: {
  event: SupportEvent;
  area: SupportArea;
  storeName: string;
  severity: string;
  description: string;
  submittedBy: string;
  actedBy: string;
  portalUrl: string;
  stepsTaken?: string;
  externalTicketNumber?: string;
  createdAt?: string;
  photoAttached?: boolean;
  photoAvailableInDash?: boolean;
}) {
  const areaName = input.area === "technology" ? "Technology" : "Maintenance";
  const eventName = input.event === "submitted" ? "New request" : "Request completed";
  const subject = `[${areaName}] ${eventName} — ${input.storeName}`;
  const actionLine = input.event === "submitted"
    ? `Submitted by: ${input.submittedBy}`
    : `Completed by: ${input.actedBy}`;
  const text = [
    `${eventName}: ${areaName}`,
    "",
    `Store: ${input.storeName}`,
    `Severity: ${input.severity.charAt(0).toUpperCase()}${input.severity.slice(1)}`,
    actionLine,
    ...(input.createdAt ? [`Submitted: ${new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" }).format(new Date(input.createdAt))} CT`] : []),
    ...(input.externalTicketNumber ? [`Related ticket: ${input.externalTicketNumber}`] : []),
    "",
    "Request:",
    input.description,
    ...(input.stepsTaken ? ["", "Steps already taken:", input.stepsTaken] : []),
    ...(input.photoAttached ? ["", "The submitted photo is attached to this email."] : []),
    ...(input.photoAvailableInDash ? ["", "An additional photo was too large to attach, but it was saved successfully and is available inside DASH-OS."] : []),
    "",
    `Open DASH-OS: ${input.portalUrl}`,
  ].join("\n");
  const html = brandedEmail({
    areaName,
    title: eventName,
    storeName: input.storeName,
    severity: input.severity,
    actionLine: input.event === "submitted" ? `Submitted by ${input.submittedBy}` : `Completed by ${input.actedBy}`,
    description: input.description,
    stepsTaken: input.stepsTaken,
    externalTicketNumber: input.externalTicketNumber,
    createdAt: input.createdAt,
    photoAttached: input.photoAttached,
    photoAvailableInDash: input.photoAvailableInDash,
    portalUrl: input.portalUrl,
  });
  return { subject, text, html };
}

export function uniqueRecipients<T extends { id: string; email: string | null }>(profiles: T[]) {
  const seen = new Set<string>();
  return profiles.filter((profile) => {
    const email = profile.email?.trim().toLowerCase();
    if (!email || seen.has(email)) return false;
    seen.add(email);
    return true;
  });
}
