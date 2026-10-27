export type SupportEvent = "submitted" | "completed";
export type SupportArea = "technology" | "maintenance";

export function supportNotificationCopy(input: {
  event: SupportEvent;
  area: SupportArea;
  storeName: string;
  severity: string;
  description: string;
  submittedBy: string;
  actedBy: string;
  portalUrl: string;
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
    "",
    "Request:",
    input.description,
    "",
    `Open DASH-OS: ${input.portalUrl}`,
  ].join("\n");
  return { subject, text };
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
