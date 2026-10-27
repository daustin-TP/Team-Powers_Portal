import {
  GmailDeliveryError,
  gmailConfig,
  refreshGmailAccessToken,
  sendGmailMessage,
  type GmailConfig,
} from "./gmail.ts";
import {
  ResendDeliveryError,
  resendConfig,
  sendResendMessage,
  type ResendConfig,
} from "./resend.ts";

export type EmailConfig =
  | ({ provider: "resend" } & ResendConfig)
  | ({ provider: "gmail" } & GmailConfig);

export function emailConfig(): EmailConfig | null {
  const resend = resendConfig();
  if (resend) return { provider: "resend", ...resend };
  const gmail = gmailConfig();
  return gmail ? { provider: "gmail", ...gmail } : null;
}

export function sendEmailMessage(
  config: EmailConfig,
  message: {
    id: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
    attachments?: { filename: string; content: string }[];
    fromName?: string;
  },
) {
  const sender = message.fromName ? { ...config, fromName: message.fromName } : config;
  return config.provider === "resend"
    ? sendResendMessage(sender as Extract<EmailConfig, { provider: "resend" }>, message)
    : sendGmailMessage(sender as Extract<EmailConfig, { provider: "gmail" }>, message);
}

export async function checkEmailConnection(config: EmailConfig) {
  if (config.provider === "gmail") await refreshGmailAccessToken(config);
  return { provider: config.provider, sender: config.fromEmail };
}

export function emailDeliveryFailure(error: unknown) {
  if (error instanceof GmailDeliveryError || error instanceof ResendDeliveryError) {
    return { retryable: error.retryable, message: error.message };
  }
  return { retryable: false, message: "Email delivery failed. Review the message before retrying." };
}
