import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

import { FatalError, RetryableError } from "workflow";

import type { ErrorReport } from "@/core/observability/error-report";

const state = vi.hoisted(() => ({ send: vi.fn(), get: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: state.send, get: state.get };
  },
}));
const report: ErrorReport = {
  kind: "application-error",
  id: "x".repeat(128),
  buildId: "y".repeat(128),
  release: "a".repeat(40),
  timestamp: 1000,
  level: "error",
  source: "server",
  name: "Error",
  message: "Synthetic failure",
  tags: { operation: "contacts.refresh" },
  frames: [],
};

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "local-fixture");
  vi.stubEnv("RESEND_OPERATOR_EMAIL", "errors@example.com");
  vi.stubEnv("ERROR_REPORTING_NOTIFICATION_EMAIL", "operator@example.com");
  vi.stubEnv("RESEND_BASE_URL", "");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("VERCEL_TARGET_ENV", "");
  vi.stubEnv("ERROR_REPORTING_VERIFY_DELIVERY", "");
  state.send.mockReset().mockResolvedValue({ error: null, data: { id: "local-email" } });
  state.get.mockReset().mockResolvedValue({ error: null, data: { last_event: "delivered" } });
});
afterEach(() => vi.unstubAllEnvs());

describe("application error notification", () => {
  it("sends actionable context with a bounded stable idempotency key", async () => {
    const { sendErrorNotification } = await import("../notify-application-error");
    await expect(sendErrorNotification(report)).resolves.toEqual({
      emailId: "local-email",
    });
    await sendErrorNotification(report);
    expect(state.send.mock.calls[0]).toEqual(state.send.mock.calls[1]);
    expect(state.send.mock.calls[0][1].idempotencyKey.length).toBeLessThan(256);
    expect(state.send.mock.calls[0][0].text).toContain(report.buildId);
    expect(state.send.mock.calls[0][0].text).toContain(report.id);
    expect(state.send.mock.calls[0][0].text).toContain(report.release);
    expect(state.send.mock.calls[0][0].text).toContain("contacts.refresh");
    expect(state.send.mock.calls[0][0].text).not.toContain("source-map");
  });

  it("uses one idempotency key per error and day, and treats a duplicate as already sent", async () => {
    const { notifyApplicationError, sendErrorNotification } = await import("../notify-application-error");
    await sendErrorNotification({ ...report, fingerprint: "f".repeat(32) });
    await sendErrorNotification({ ...report, id: "other-event", timestamp: 2000, fingerprint: "f".repeat(32) });
    await sendErrorNotification({ ...report, timestamp: 1000 + 86_400, fingerprint: "f".repeat(32) });
    const keys = state.send.mock.calls.map((call) => call[1].idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);

    state.send.mockResolvedValue({ error: { statusCode: 409 }, data: null });
    await expect(notifyApplicationError({ ...report, fingerprint: "f".repeat(32) })).resolves.toEqual({
      duplicate: true,
    });
    await expect(sendErrorNotification(report)).rejects.toThrow();
  });

  it("retries provider-returned failures, which the SDK does not throw", async () => {
    const { sendErrorNotification } = await import("../notify-application-error");
    state.send.mockResolvedValue({ error: { statusCode: 503 }, data: null });
    const before = Date.now();
    const error = await sendErrorNotification(report).catch((error: unknown) => error);
    expect(RetryableError.is(error)).toBe(true);
    expect((error as RetryableError).retryAfter.getTime()).toBeGreaterThanOrEqual(before + 5000);
    expect((error as RetryableError).retryAfter.getTime()).toBeLessThanOrEqual(Date.now() + 5000);
    expect(sendErrorNotification.maxRetries).toBe(5);
  });

  it("refuses hosted or non-loopback SDK overrides before sending", async () => {
    const { sendErrorNotification } = await import("../notify-application-error");
    vi.stubEnv("RESEND_BASE_URL", "https://untrusted.example.com");
    await expect(sendErrorNotification(report)).rejects.toThrow();
    expect(state.send).not.toHaveBeenCalled();
    vi.stubEnv("RESEND_BASE_URL", "http://127.0.0.1:4018");
    vi.stubEnv("VERCEL", "1");
    await expect(sendErrorNotification(report)).rejects.toThrow();
    expect(state.send).not.toHaveBeenCalled();
  });

  it("verifies only the email just sent to the automated Preview delivery sink", async () => {
    const { notifyApplicationError } = await import("../notify-application-error");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("ERROR_REPORTING_VERIFY_DELIVERY", "true");
    vi.stubEnv("ERROR_REPORTING_NOTIFICATION_EMAIL", "delivered+customermates-pr197@resend.dev");
    await expect(notifyApplicationError(report)).resolves.toEqual({
      emailId: "local-email",
      delivery: "delivered",
    });
    expect(state.get).toHaveBeenCalledExactlyOnceWith("local-email");
  });

  it.each(["production", "development", ""])("skips delivery readback outside Preview (%s)", async (environment) => {
    const { notifyApplicationError } = await import("../notify-application-error");
    vi.stubEnv("VERCEL_ENV", environment);
    vi.stubEnv("ERROR_REPORTING_VERIFY_DELIVERY", "true");
    await expect(notifyApplicationError(report)).resolves.toEqual({
      emailId: "local-email",
    });
    expect(state.get).not.toHaveBeenCalled();
  });

  it("refuses Preview verification to a real mailbox before sending", async () => {
    const { notifyApplicationError } = await import("../notify-application-error");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("ERROR_REPORTING_VERIFY_DELIVERY", "true");
    await expect(notifyApplicationError(report)).rejects.toThrow();
    expect(state.send).not.toHaveBeenCalled();
    expect(state.get).not.toHaveBeenCalled();
  });

  it("bounds pending delivery retries and stops immediately on forbidden readback", async () => {
    const { verifyPreviewErrorDelivery } = await import("../notify-application-error");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("ERROR_REPORTING_VERIFY_DELIVERY", "true");
    vi.stubEnv("ERROR_REPORTING_NOTIFICATION_EMAIL", "delivered+customermates-pr197@resend.dev");
    state.get.mockResolvedValueOnce({
      error: null,
      data: { last_event: "queued" },
    });
    const pending = await verifyPreviewErrorDelivery("local-email").catch((error: unknown) => error);
    expect(RetryableError.is(pending)).toBe(true);
    expect(verifyPreviewErrorDelivery.maxRetries).toBe(5);
    state.get.mockResolvedValueOnce({ error: { statusCode: 403 }, data: null });
    const denied = await verifyPreviewErrorDelivery("local-email").catch((error: unknown) => error);
    expect(RetryableError.is(denied)).toBe(false);
    expect(state.get).toHaveBeenCalledTimes(2);
  });
});

describe("application error webhook", () => {
  const fingerprinted = { ...report, fingerprint: "f".repeat(32) };

  beforeEach(() => {
    vi.stubEnv("ERROR_REPORTING_WEBHOOK_URL", "https://hooks.example.com/errors");
    vi.stubEnv("ERROR_REPORTING_WEBHOOK_SECRET", "webhook-secret");
  });
  afterEach(() => vi.unstubAllGlobals());

  it("posts the report with an HMAC-SHA256 signature of the exact body, without redirects", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetch);
    const { notifyApplicationError } = await import("../notify-application-error");
    await expect(notifyApplicationError(fingerprinted, { email: false, webhook: true })).resolves.toBeNull();
    const [target, init] = fetch.mock.calls[0] as [URL, RequestInit & { headers: Record<string, string> }];
    expect(String(target)).toBe("https://hooks.example.com/errors");
    expect(init.redirect).toBe("error");
    const expected = createHmac("sha256", "webhook-secret").update(String(init.body)).digest("hex");
    expect(init.headers["x-customermates-signature"]).toBe(`sha256=${expected}`);
    expect(JSON.parse(String(init.body))).toMatchObject({ fingerprint: "f".repeat(32), report: { id: report.id } });
    expect(state.send).not.toHaveBeenCalled();
  });

  it("retries outages and stops on a rejected or non-HTTPS target", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetch);
    const { deliverErrorWebhook } = await import("../notify-application-error");
    await expect(deliverErrorWebhook(fingerprinted)).rejects.toBeInstanceOf(RetryableError);
    fetch.mockResolvedValue(new Response(null, { status: 401 }));
    await expect(deliverErrorWebhook(fingerprinted)).rejects.toBeInstanceOf(FatalError);
    vi.stubEnv("ERROR_REPORTING_WEBHOOK_URL", "http://hooks.example.com/errors");
    fetch.mockClear();
    await expect(deliverErrorWebhook(fingerprinted)).rejects.toBeInstanceOf(FatalError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
