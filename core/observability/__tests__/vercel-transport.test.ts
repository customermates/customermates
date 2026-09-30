import type { ErrorEvent } from "@sentry/nextjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ERROR_NOTIFICATION_FAILURE_PREFIX, errorReport } from "../error-report";
import { createVercelErrorTransport } from "../vercel-transport";
import { errorReportingDsn, usesVercelErrorReporting } from "@/core/errors/reporting-provider";

afterEach(() => vi.unstubAllEnvs());

function event(): ErrorEvent {
  return {
    type: undefined,
    event_id: "event-1",
    timestamp: 123,
    message: "fallback",
    exception: {
      values: [
        {
          type: "Error",
          value: "failed https://person:password@example.com/path?token=sensitive password=private person@example.com",
          stacktrace: {
            frames: [{ filename: "https://app.example.com/_next/static/chunk.js?token=private", lineno: 1, colno: 3 }],
          },
        },
      ],
    },
    user: { id: "user-1", email: "person@example.com" },
    tags: { companyId: "company-1" },
    request: {
      url: "https://app.example.com/deals?token=private",
      headers: { Authorization: "secret" },
      data: "private body",
    },
    extra: { secret: "private extra" },
    breadcrumbs: [{ message: "private breadcrumb" }],
  };
}

describe("Vercel error transport", () => {
  it("keeps Sentry as the default and rejects misspelled providers", () => {
    vi.stubEnv("NEXT_PUBLIC_ERROR_REPORTING_PROVIDER", "");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@example.com/1");
    expect(usesVercelErrorReporting()).toBe(false);
    expect(errorReportingDsn()).toBe("https://public@example.com/1");
    vi.stubEnv("NEXT_PUBLIC_ERROR_REPORTING_PROVIDER", "vercle");
    expect(() => usesVercelErrorReporting()).toThrow("sentry or vercel");
  });

  it("retains useful server context and strips sensitive SDK fields", () => {
    vi.stubEnv("NEXT_PUBLIC_ERROR_REPORTING_BUILD_ID", "build-1");
    const report = errorReport(event(), "server");
    expect(report).toMatchObject({
      buildId: "build-1",
      path: "/deals",
      tenant: { userId: "user-1", companyId: "company-1" },
    });
    expect(JSON.stringify(report)).not.toMatch(/sensitive|private|person@example|Authorization|password@example/);
    expect(report?.frames[0].file).toBe("https://app.example.com/_next/static/chunk.js");
    expect(errorReport(event(), "browser")?.tenant).toBeUndefined();
  });

  it("does not turn notification failures into further notifications", () => {
    vi.stubEnv("NEXT_PUBLIC_ERROR_REPORTING_BUILD_ID", "build-1");
    expect(
      errorReport(
        {
          ...event(),
          exception: {
            values: [{ type: "RetryableError", value: `${ERROR_NOTIFICATION_FAILURE_PREFIX} delivery failed` }],
          },
        },
        "server",
      ),
    ).toBeNull();
  });

  it("redacts invitation tokens in server paths and embedded URLs", () => {
    vi.stubEnv("NEXT_PUBLIC_ERROR_REPORTING_BUILD_ID", "build-1");
    const input = event();
    input.request = {
      url: "https://person:credential@app.example.com/en/invitation/synthetic-secret?token=query-secret",
    };
    input.exception = {
      values: [{ type: "Error", value: "failed https://app.example.com/en/invitation/synthetic-secret" }],
    };
    const report = errorReport(input, "server");
    expect(report?.path).toBe("/en/invitation/[redacted]");
    expect(JSON.stringify(report)).not.toMatch(/synthetic-secret|credential|query-secret/);
  });

  it("waits for durable enqueue on flush and never delivers trace envelopes", async () => {
    vi.stubEnv("NEXT_PUBLIC_ERROR_REPORTING_BUILD_ID", "build-1");
    let finish!: () => void;
    const publish = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const transport = createVercelErrorTransport("server", publish);
    const pending = transport.send([
      { event_id: "event-1", sent_at: "2026-09-30T12:00:00Z" },
      [[{ type: "event" }, event()]],
    ]);
    expect(await transport.flush(1)).toBe(false);
    finish();
    await pending;
    expect(await transport.flush(100)).toBe(true);
    await transport.send([
      { event_id: "event-1", sent_at: "2026-09-30T12:00:00Z" },
      [[{ type: "transaction" }, event()]],
    ]);
    expect(publish).toHaveBeenCalledOnce();
  });

  it("surfaces enqueue failures and bounds pending reports", async () => {
    vi.stubEnv("NEXT_PUBLIC_ERROR_REPORTING_BUILD_ID", "build-1");
    const failed = createVercelErrorTransport("server", () => Promise.reject(new Error("queue unavailable")));
    await expect(
      failed.send([{ event_id: "event-1", sent_at: "2026-09-30T12:00:00Z" }, [[{ type: "event" }, event()]]]),
    ).rejects.toThrow("queue unavailable");
    const pending = createVercelErrorTransport("server", () => new Promise(() => undefined));
    for (let index = 0; index < 30; index++)
      void pending.send([{ event_id: "event-1", sent_at: "2026-09-30T12:00:00Z" }, [[{ type: "event" }, event()]]]);
    await expect(
      pending.send([{ event_id: "event-1", sent_at: "2026-09-30T12:00:00Z" }, [[{ type: "event" }, event()]]]),
    ).rejects.toThrow("buffer is full");
  });
});
