import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RetryableError } from "workflow";

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
