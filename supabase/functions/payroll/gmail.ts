export type GmailConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fromEmail: string;
  fromName: string;
};

export class GmailDeliveryError extends Error {
  retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "GmailDeliveryError";
    this.retryable = retryable;
  }
}

export function gmailConfig(get = (key: string) => Deno.env.get(key)): GmailConfig | null {
  const config = {
    clientId: get("GOOGLE_GMAIL_CLIENT_ID")?.trim() ?? "",
    clientSecret: get("GOOGLE_GMAIL_CLIENT_SECRET")?.trim() ?? "",
    refreshToken: get("GOOGLE_GMAIL_REFRESH_TOKEN")?.trim() ?? "",
    fromEmail: get("GOOGLE_GMAIL_FROM_EMAIL")?.trim() ?? "",
    fromName: get("GOOGLE_GMAIL_FROM_NAME")?.trim() || "DASH-OS",
  };
  return config.clientId && config.clientSecret && config.refreshToken && config.fromEmail ? config : null;
}

function base64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64Url(value: string) {
  return base64(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function safeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodedHeader(value: string) {
  return `=?UTF-8?B?${base64(safeHeader(value))}?=`;
}

function wrappedBase64(value: string) {
  return base64(value).match(/.{1,76}/g)?.join("\r\n") ?? "";
}

export function gmailRawMessage(message: { id: string; to: string; subject: string; text: string }, config: GmailConfig) {
  const messageId = safeHeader(message.id).replace(/[^a-zA-Z0-9._-]/g, "-");
  const domain = config.fromEmail.split("@")[1] || "powerspizza.com";
  const mime = [
    `From: ${encodedHeader(config.fromName)} <${safeHeader(config.fromEmail)}>`,
    `To: ${safeHeader(message.to)}`,
    `Subject: ${encodedHeader(message.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <dash-os-${messageId}@${safeHeader(domain)}>`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrappedBase64(message.text.replace(/\r?\n/g, "\r\n")),
  ].join("\r\n");
  return base64Url(mime);
}

export async function refreshGmailAccessToken(config: GmailConfig, request: typeof fetch = fetch) {
  let response: Response;
  try {
    response = await request("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: config.refreshToken,
        grant_type: "refresh_token",
      }),
    });
  } catch {
    throw new GmailDeliveryError("Google authorization could not be reached. Delivery will retry safely.", true);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.access_token !== "string") {
    const reason = typeof result.error === "string" && /^[a-z_]+$/i.test(result.error) ? result.error : `HTTP ${response.status}`;
    throw new GmailDeliveryError(`Google rejected the Gmail authorization (${reason}). Reconnect the DASH-OS mailbox.`, false);
  }
  return result.access_token as string;
}

export async function sendGmailMessage(
  config: GmailConfig,
  message: { id: string; to: string; subject: string; text: string },
  request: typeof fetch = fetch,
) {
  const accessToken = await refreshGmailAccessToken(config, request);
  let response: Response;
  try {
    response = await request("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: gmailRawMessage(message, config) }),
    });
  } catch {
    // The network can fail after Google accepts a message. Do not automatically
    // send a possible duplicate; leave it for an administrator to reconcile.
    throw new GmailDeliveryError("Gmail delivery could not be confirmed. Review before retrying to prevent a duplicate.", false);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.id !== "string") {
    const retryable = response.status === 429 || response.status >= 500;
    throw new GmailDeliveryError(
      retryable ? "Gmail is temporarily unavailable. Delivery will retry safely." : "Gmail rejected the message. Review the mailbox connection.",
      retryable,
    );
  }
  return result.id as string;
}
