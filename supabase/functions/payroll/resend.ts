export type ResendConfig = {
  apiKey: string;
  fromEmail: string;
  fromName: string;
};

export class ResendDeliveryError extends Error {
  retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "ResendDeliveryError";
    this.retryable = retryable;
  }
}

export function resendConfig(get = (key: string) => Deno.env.get(key)): ResendConfig | null {
  const config = {
    apiKey: get("RESEND_API_KEY")?.trim() ?? "",
    fromEmail: get("PAYROLL_FROM_EMAIL")?.trim() || get("RESEND_FROM_EMAIL")?.trim() || "",
    fromName: get("RESEND_FROM_NAME")?.trim() || get("GOOGLE_GMAIL_FROM_NAME")?.trim() || "DASH-OS",
  };
  return config.apiKey && config.fromEmail ? config : null;
}

function safeIdempotencyKey(value: string) {
  return `dash-os-${value.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 200)}`;
}

export async function sendResendMessage(
  config: ResendConfig,
  message: {
    id: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
    attachments?: { filename: string; content: string }[];
  },
  request: typeof fetch = fetch,
) {
  let response: Response;
  try {
    response = await request("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": safeIdempotencyKey(message.id),
      },
      body: JSON.stringify({
        from: `${config.fromName} <${config.fromEmail}>`,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.attachments?.length ? { attachments: message.attachments } : {}),
      }),
    });
  } catch {
    // A network failure may occur after Resend accepted the request. The
    // idempotency key prevents a duplicate if an administrator retries it.
    throw new ResendDeliveryError("Resend delivery could not be confirmed. Review before retrying.", false);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.id !== "string") {
    const retryable = response.status === 429 || response.status >= 500;
    throw new ResendDeliveryError(
      retryable
        ? "Resend is temporarily unavailable. Delivery will retry safely."
        : "Resend rejected the message. Confirm the API key and verified sender address.",
      retryable,
    );
  }
  return result.id as string;
}
