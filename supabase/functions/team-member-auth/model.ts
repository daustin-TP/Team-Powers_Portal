export const normalizeEmail = (value: unknown) => String(value ?? "").trim().toLowerCase();

export const validEmail = (value: string) =>
  value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const escapeHtml = (value: string) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

export function signInEmail(displayName: string, actionLink: string) {
  const name = escapeHtml(displayName || "Team member");
  const link = escapeHtml(actionLink);
  return {
    subject: "Your secure DASH schedule sign-in",
    text: `Hello ${displayName || "Team member"},\n\nUse this one-time link to open your DASH schedule and request-off portal:\n${actionLink}\n\nFor your security, do not forward this email. If you did not request it, you can ignore it.`,
    html: `<!doctype html><html><body style="margin:0;background:#eef3f8;font-family:Arial,Helvetica,sans-serif;color:#10233d"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f8"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #dce5ef"><tr><td style="background:#07111f;padding:24px 28px"><div style="font-size:28px;font-style:italic;font-weight:900"><span style="color:#ff2828">DA</span><span style="color:#168fff">SH</span><span style="color:#fff">os</span></div><div style="color:#a9bbcf;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;margin-top:5px">Team Powers Operations System</div></td></tr><tr><td style="padding:30px 28px"><div style="font-size:12px;color:#0878c9;font-weight:800;letter-spacing:.12em;text-transform:uppercase">Team member access</div><h1 style="margin:8px 0 14px;font-size:25px;line-height:1.25;color:#071a33">Open your schedule securely</h1><p style="margin:0 0 24px;color:#425b76;font-size:15px;line-height:1.65">Hello ${name}, use the button below to see your published schedule and submit availability or request-off changes.</p><a href="${link}" style="display:inline-block;background:#0878c9;color:#fff;text-decoration:none;font-size:15px;font-weight:800;padding:13px 22px;border-radius:8px">Open DASH securely</a><p style="margin:24px 0 0;color:#718096;font-size:12px;line-height:1.55">This is a one-time sign-in link. Do not forward it. If you did not request this email, no action is needed.</p></td></tr><tr><td style="background:#f7fafc;border-top:1px solid #e3eaf2;padding:18px 28px;color:#718096;font-size:11px">Sent securely by DASHos for Team Powers.</td></tr></table></td></tr></table></body></html>`,
  };
}
