import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ session: vi.fn(), publish: vi.fn() }));
vi.mock("@/core/observability/request-context", () => ({
  requestErrorContext: state.session,
}));
vi.mock("@/core/observability/publish-error", () => ({
  publishServerError: state.publish,
}));
vi.mock("@/env", () => ({
  env: {
    BASE_URL: "https://preview.example.com",
    AUTH_ALLOWED_HOSTS: ["preview.example.com"],
  },
}));

const report = {
  kind: "application-error",
  id: "event-1",
  buildId: "build-1",
  timestamp: Date.now() / 1000,
  source: "browser",
  level: "error",
  name: "Error",
  message: "failed token=private",
  frames: [],
};
let requests = 0;
function request(body: unknown = report, origin = "https://preview.example.com") {
  return new Request("https://preview.example.com/api/observability/errors", {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "x-real-ip": String(++requests),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_ERROR_REPORTING_PROVIDER", "vercel");
  state.session.mockReset().mockResolvedValue({
    authenticated: true,
    context: {
      user: { id: "trusted-user" },
      tags: { companyId: "trusted-company" },
    },
  });
  state.publish.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("browser error intake", () => {
  it("is disabled when reporting is explicitly off", async () => {
    vi.stubEnv("NEXT_PUBLIC_ERROR_REPORTING_PROVIDER", "off");
    const { POST } = await import("../route");
    expect((await POST(request())).status).toBe(404);
    expect(state.session).not.toHaveBeenCalled();
    expect(state.publish).not.toHaveBeenCalled();
  });

  it("rejects cross-origin submissions and logs anonymous errors without notifications", async () => {
    const { POST } = await import("../route");
    expect((await POST(request(report, "https://attacker.example.com"))).status).toBe(403);
    state.session.mockResolvedValue({ authenticated: false, context: {} });
    for (let index = 0; index < 20; index++)
      expect((await POST(request({ ...report, id: `forged-${index}` }))).status).toBe(202);
    expect(state.publish).toHaveBeenCalledTimes(20);
    for (const [report, notify] of state.publish.mock.calls) {
      expect(report.tenant).toBeUndefined();
      expect(notify).toBe(false);
    }
  });

  it("accepts the verified public host when Next uses an internal request URL", async () => {
    const { POST } = await import("../route");
    const incoming = new Request("http://localhost:4017/api/observability/errors", {
      method: "POST",
      headers: {
        host: "preview.example.com",
        origin: "https://preview.example.com",
        "content-type": "application/json",
        "x-real-ip": String(++requests),
      },
      body: JSON.stringify(report),
    });
    expect((await POST(incoming)).status).toBe(202);
  });

  it("uses authenticated context, scrubs input and preserves the reported event time", async () => {
    const { POST } = await import("../route");
    expect(
      (
        await POST(
          request({
            ...report,
            release: "a".repeat(40),
            tags: { operation: "contacts.refresh", detail: "token=private" },
            tenant: { userId: "forged" },
            extra: { secret: "private" },
          }),
        )
      ).status,
    ).toBe(202);
    expect(state.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant: { userId: "trusted-user", companyId: "trusted-company" },
        message: "failed token=[redacted]",
        timestamp: expect.any(Number),
        release: "a".repeat(40),
        tags: { operation: "contacts.refresh", detail: "token=[redacted]" },
      }),
      true,
    );
    expect(state.publish.mock.calls[0][0].timestamp).toBe(report.timestamp);
    expect(state.publish.mock.calls[0][0]).not.toHaveProperty("extra");
  });

  it("rejects malformed, oversized and server-forged payloads", async () => {
    const { POST } = await import("../route");
    expect((await POST(request({ ...report, source: "server" }))).status).toBe(400);
    expect((await POST(request({ ...report, timestamp: 1e100 }))).status).toBe(400);
    expect((await POST(request({ ...report, message: "x".repeat(41_000) }))).status).toBe(413);
    expect(state.publish).not.toHaveBeenCalled();
  });

  it("preserves bounded browser causes and redacts them before publication", async () => {
    const { POST } = await import("../route");
    const cause = {
      name: "Error",
      message: "underlying token=private for person@example.com",
      frames: [{ file: "https://preview.example.com/code.js?token=private", line: 5 }],
      extra: { secret: "private" },
    };
    expect((await POST(request({ ...report, causes: [cause] }))).status).toBe(202);
    const captured = state.publish.mock.lastCall?.[0];
    expect(captured.causes).toHaveLength(1);
    expect(captured.causes[0].message).toContain("underlying");
    expect(JSON.stringify(captured.causes)).not.toMatch(/private|person@|extra/);
    expect((await POST(request({ ...report, causes: Array(4).fill(cause) }))).status).toBe(400);
    expect(
      (await POST(request({ ...report, causes: [{ ...cause, frames: Array(4).fill(cause.frames[0]) }] }))).status,
    ).toBe(400);
  });

  it("normalizes browser paths and removes invitation secrets and encoded email", async () => {
    const { POST } = await import("../route");
    for (const path of [
      "https://person:credential@preview.example.com/en/invitation/synthetic-secret?token=query-secret",
      "/en/%69nvitation/synthetic-secret",
    ]) {
      expect((await POST(request({ ...report, path }))).status).toBe(202);
      expect(state.publish.mock.lastCall?.[0].path).toBe("/en/invitation/[redacted]");
    }
    expect(
      (
        await POST(
          request({
            ...report,
            path: "/en/person%40example.com?token=query-secret",
          }),
        )
      ).status,
    ).toBe(202);
    expect(state.publish.mock.lastCall?.[0].path).toBe("/en/[redacted email]");
    expect(JSON.stringify(state.publish.mock.calls)).not.toMatch(/synthetic-secret|credential|query-secret|person/);
  });

  it("returns retryable status without recapturing enqueue failure", async () => {
    const { POST } = await import("../route");
    state.publish.mockRejectedValue(new Error("unavailable"));
    expect((await POST(request())).status).toBe(503);
    expect(state.publish).toHaveBeenCalledOnce();
  });
});
