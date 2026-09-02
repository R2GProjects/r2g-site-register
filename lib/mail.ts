/**
 * How a notification actually leaves the building.
 *
 * A webhook is the default: Synology, Zapier or n8n can turn the JSON into
 * whatever the business already pays for. Resend is the built-in email path
 * when NOTIFY_FROM is a verified domain. Neither is a hard dependency — if
 * nothing is configured the cron still reports who would have been told.
 */

export type NotifyKind = "signout-reminder" | "daily-summary";

export interface NotifyMessage {
  kind: NotifyKind;
  to: string;
  subject: string;
  text: string;
  siteCode?: string;
}

export type NotifyTransport =
  | { kind: "none" }
  | { kind: "webhook"; url: string }
  | { kind: "resend"; apiKey: string; from: string };

export function notifyTransport(
  env: Record<string, string | undefined> = process.env
): NotifyTransport {
  const webhook = (env.NOTIFY_WEBHOOK_URL || "").trim();
  if (webhook && /^https?:\/\//i.test(webhook)) {
    return { kind: "webhook", url: webhook };
  }
  const apiKey = (env.RESEND_API_KEY || "").trim();
  const from = (env.NOTIFY_FROM || "").trim();
  if (apiKey && from) {
    return { kind: "resend", apiKey, from };
  }
  return { kind: "none" };
}

export function webhookPayload(message: NotifyMessage): Record<string, unknown> {
  return {
    kind: message.kind,
    to: message.to,
    subject: message.subject,
    text: message.text,
    siteCode: message.siteCode || null,
  };
}

export function resendPayload(
  message: NotifyMessage,
  from: string
): Record<string, unknown> {
  return {
    from,
    to: [message.to],
    subject: message.subject,
    text: message.text,
  };
}

export async function sendNotify(
  message: NotifyMessage,
  transport: NotifyTransport = notifyTransport()
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (transport.kind === "none") {
    return { ok: false, error: "No notification transport is configured" };
  }
  try {
    if (transport.kind === "webhook") {
      const res = await fetch(transport.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(webhookPayload(message)),
      });
      if (!res.ok) {
        return { ok: false, error: `Webhook ${res.status}` };
      }
      return { ok: true };
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${transport.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resendPayload(message, transport.from)),
    });
    if (!res.ok) {
      return { ok: false, error: `Resend ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
