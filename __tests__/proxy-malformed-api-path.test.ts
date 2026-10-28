import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

vi.mock("next-intl/middleware", () => ({ default: () => vi.fn() }));
vi.mock("@/i18n/routing", () => ({
  appRouting: {},
  contentRouting: {},
  isContentPage: vi.fn(() => false),
  isPublicPage: vi.fn(() => false),
}));
vi.mock("@/env", () => ({
  env: { APP_MODE: "cloud", AUTH_ALLOWED_HOSTS: ["localhost:4000"], BASE_URL: "http://localhost:4000" },
}));
vi.mock("@/core/auth/better-auth", () => ({ auth: { api: { getSession: vi.fn() } } }));

import proxy, { config } from "@/proxy";
import { MALFORMED_REQUEST_PATH_MESSAGE } from "@/core/api/request-path-error";

const matcher = {
  test(url: string, headers: Record<string, string> = {}) {
    return unstable_doesMiddlewareMatch({
      config: config as Parameters<typeof unstable_doesMiddlewareMatch>[0]["config"],
      url,
      headers,
    });
  },
};

describe("API paths whose percent-encoding cannot be decoded", () => {
  it.each([
    "/api/v1/deals/%ZZ",
    "/api/v1/contacts/%ZZ",
    "/api/v1/webhooks/%E0%A4%A",
    "/api/v1/contacts/a%ZZ%40x.example",
    "/api/messaging/attachments/%ZZ/x.pdf",
  ])("answer %s with a 400 JSON string before Next tries to decode the segment", async (path) => {
    expect(matcher.test(path)).toBe(true);

    const response = await proxy(new NextRequest(`http://localhost:4000${path}`));

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toBe(MALFORMED_REQUEST_PATH_MESSAGE);
  });

  it.each(["/api/v1/deals/%41bc", "/api/v1/contacts/ada%40example.com"])(
    "pass a correctly encoded path %s through",
    async (path) => {
      const response = await proxy(new NextRequest(`http://localhost:4000${path}`));

      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
    },
  );

  it("still keeps static files outside the API out of the proxy", () => {
    expect(matcher.test("/logo.png")).toBe(false);
    expect(matcher.test("/_next/static/chunk.js")).toBe(false);
  });

  it.each([
    "/api/v1/files/40000000-0000-4000-8000-000000000001/content",
    "/api/w/alpha/v1/files/40000000-0000-4000-8000-000000000001/content",
  ])("streams credential-scoped content at %s while retaining session workspace forwarding", (path) => {
    expect(matcher.test(path)).toBe(true);
    expect(matcher.test(path, { cookie: "app.session_token=session", "x-cm-workspace": "forged" })).toBe(true);
    expect(matcher.test(path, { "x-api-key": "key" })).toBe(false);
    expect(matcher.test(path, { authorization: "Bearer token" })).toBe(false);
    expect(matcher.test(path, { authorization: "bearer token" })).toBe(false);
    expect(matcher.test(path, { authorization: "Basic token" })).toBe(true);
    expect(matcher.test(path + "?token=signed")).toBe(false);
    expect(matcher.test(path + "?token=")).toBe(true);
  });

  it("keeps other API routes behind the proxy even with file credentials", () => {
    expect(matcher.test("/api/v1/files/uploads?token=signed", { "x-api-key": "key" })).toBe(true);
    expect(matcher.test("/api/w/alpha/v1/files/uploads", { "x-api-key": "key" })).toBe(true);
  });
});
