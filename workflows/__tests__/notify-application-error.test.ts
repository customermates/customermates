import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RetryableError } from "workflow";

import type { ErrorReport } from "@/core/observability/error-report";

const state = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: state.send };
  },
}));
const report: ErrorReport = {
  kind: "application-error",
  id: "x".repeat(128),
  buildId: "y".repeat(128),
  timestamp: 1000,
  level: "error",
  source: "server",
  name: "Error",
  message: "Synthetic failure",
  frames: [],
};

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "local-fixture");
  vi.stubEnv("RESEND_OPERATOR_EMAIL", "errors@example.com");
  vi.stubEnv("ERROR_REPORTING_NOTIFICATION_EMAIL", "operator@example.com");
  vi.stubEnv("RESEND_BASE_URL", "");
  vi.stubEnv("VERCEL", "");
  state.send.mockReset().mockResolvedValue({ error: null, data: { id: "local-email" } });
});
afterEach(() => vi.unstubAllEnvs());

describe("application error notification", () => {
  it("sends actionable context with a bounded stable idempotency key", async () => {
    const { sendErrorNotification } = await import("../notify-application-error");
    await expect(sendErrorNotification(report)).resolves.toEqual({ emailId: "local-email" });
    await sendErrorNotification(report);
    expect(state.send.mock.calls[0]).toEqual(state.send.mock.calls[1]);
    expect(state.send.mock.calls[0][1].idempotencyKey.length).toBeLessThan(256);
    expect(state.send.mock.calls[0][0].text).toContain(report.buildId);
    expect(state.send.mock.calls[0][0].text).toContain(report.id);
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
});
