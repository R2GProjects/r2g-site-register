import { describe, expect, it } from "vitest";
import {
  notifyTransport,
  resendPayload,
  webhookPayload,
} from "@/lib/mail";

const message = {
  kind: "signout-reminder" as const,
  to: "sam@r2g.test",
  subject: "You're still signed in at Building 5",
  text: "Hi Sam,",
  siteCode: "WGSB5",
};

describe("notifyTransport", () => {
  it("prefers a webhook when one is set", () => {
    expect(
      notifyTransport({
        NOTIFY_WEBHOOK_URL: "https://hooks.example/notify",
        RESEND_API_KEY: "re_xxx",
        NOTIFY_FROM: "register@r2g.test",
      })
    ).toEqual({ kind: "webhook", url: "https://hooks.example/notify" });
  });

  it("uses Resend when from and key are both set", () => {
    expect(
      notifyTransport({
        RESEND_API_KEY: "re_xxx",
        NOTIFY_FROM: "Site Register <register@r2g.test>",
      })
    ).toEqual({
      kind: "resend",
      apiKey: "re_xxx",
      from: "Site Register <register@r2g.test>",
    });
  });

  it("is none when nothing is configured, so the cron can still report who would be told", () => {
    expect(notifyTransport({})).toEqual({ kind: "none" });
    expect(notifyTransport({ RESEND_API_KEY: "re_xxx" })).toEqual({ kind: "none" });
    expect(notifyTransport({ NOTIFY_WEBHOOK_URL: "not-a-url" })).toEqual({ kind: "none" });
  });
});

describe("payloads", () => {
  it("puts the kind on the webhook body so Zapier can branch", () => {
    expect(webhookPayload(message)).toMatchObject({
      kind: "signout-reminder",
      to: "sam@r2g.test",
      siteCode: "WGSB5",
    });
  });

  it("wraps the address the way Resend expects", () => {
    expect(resendPayload(message, "register@r2g.test")).toEqual({
      from: "register@r2g.test",
      to: ["sam@r2g.test"],
      subject: message.subject,
      text: message.text,
    });
  });
});
