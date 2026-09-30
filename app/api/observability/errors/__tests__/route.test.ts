import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ session: vi.fn(), publish: vi.fn() }));
vi.mock("@/core/di", () => ({ getAuthService: () => ({ getInteractiveSession: state.session }) }));
vi.mock("@/core/observability/publish-error", () => ({ publishServerError: state.publish }));
vi.mock("@/env", () => ({
  env: { BASE_URL: "https://preview.example.com", AUTH_ALLOWED_HOSTS: ["preview.example.com"] },
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
    headers: { origin, "content-type": "application/json", "x-real-ip": String(++requests) },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_ERROR_REPORTING_PROVIDER", "vercel");
  state.session.mockReset().mockResolvedValue({ user: { id: "trusted-user", companyId: "trusted-company" } });
  state.publish.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("browser error intake", () => {
  it("is disabled for existing deployments", async () => {
    vi.stubEnv("NEXT_PUBLIC_ERROR_REPORTING_PROVIDER", "sentry");
    const { POST } = await import("../route");
    expect((await POST(request())).status).toBe(404);
    expect(state.session).not.toHaveBeenCalled();
    expect(state.publish).not.toHaveBeenCalled();
  });

  it("rejects cross-origin and anonymous submissions before notification", async () => {
    const { POST } = await import("../route");
    expect((await POST(request(report, "https://attacker.example.com"))).status).toBe(403);
    state.session.mockResolvedValue(null);
    for (let index = 0; index < 20; index++)
      expect((await POST(request({ ...report, id: `forged-${index}` }))).status).toBe(401);
    expect(state.publish).not.toHaveBeenCalled();
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
      (await POST(request({ ...report, tenant: { userId: "forged" }, extra: { secret: "private" } }))).status,
    ).toBe(202);
    expect(state.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant: { userId: "trusted-user", companyId: "trusted-company" },
        message: "failed token=[redacted]",
        timestamp: expect.any(Number),
      }),
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

  it("normalizes browser paths and removes invitation secrets and encoded email", async () => {
    const { POST } = await import("../route");
    for (const path of [
      "https://person:credential@preview.example.com/en/invitation/synthetic-secret?token=query-secret",
      "/en/%69nvitation/synthetic-secret",
    ]) {
      expect((await POST(request({ ...report, path }))).status).toBe(202);
      expect(state.publish.mock.lastCall?.[0].path).toBe("/en/invitation/[redacted]");
    }
    expect((await POST(request({ ...report, path: "/en/person%40example.com?token=query-secret" }))).status).toBe(202);
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
