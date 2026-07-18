import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiKey: vi.fn(() => ({ id: "api-key" })),
  betterAuth: vi.fn((options) => options),
  env: {} as Record<string, string | undefined>,
  mcp: vi.fn(() => ({ id: "mcp" })),
  nextCookies: vi.fn(() => ({ id: "next-cookies" })),
  oAuthProxy: vi.fn((options) => ({ id: "oauth-proxy", options })),
}));

vi.mock("@/env", () => ({ env: mocks.env }));
vi.mock("@/prisma/db", () => ({ prisma: {} }));
vi.mock("@/core/decorators/tenant-context", () => ({ runWithoutTenant: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("better-auth/adapters/prisma", () => ({ prismaAdapter: vi.fn(() => ({ id: "prisma" })) }));
vi.mock("better-auth/minimal", () => ({ betterAuth: mocks.betterAuth }));
vi.mock("better-auth/plugins", () => ({ mcp: mocks.mcp, oAuthProxy: mocks.oAuthProxy }));
vi.mock("@better-auth/api-key", () => ({ apiKey: mocks.apiKey }));
vi.mock("better-auth/next-js", () => ({ nextCookies: mocks.nextCookies }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  Object.assign(mocks.env, {
    APP_MODE: "cloud",
    BASE_URL: "https://feat-oauth.customermates.com",
    OAUTH_PROXY_SECRET: "shared-proxy-secret",
    OAUTH_PROXY_URL: "https://customermates.com",
    PREVIEW_DOMAIN: "customermates.com",
    VERCEL_BRANCH_ORIGIN: "https://customermates-git-feat-oauth.vercel.app",
  });
});

describe("Better Auth Preview configuration", () => {
  it("routes Preview OAuth through the stable Production callback", async () => {
    await import("../better-auth");

    expect(mocks.oAuthProxy).toHaveBeenCalledWith({
      currentURL: "https://feat-oauth.customermates.com",
      productionURL: "https://customermates.com",
      secret: "shared-proxy-secret",
    });
    expect(mocks.betterAuth.mock.calls[0]?.[0]).toMatchObject({
      trustedOrigins: [
        "https://feat-oauth.customermates.com",
        "https://customermates-git-feat-oauth.vercel.app",
        "https://*.customermates.com",
      ],
    });
  });

  it("identifies Production as the stable proxy endpoint", async () => {
    Object.assign(mocks.env, {
      BASE_URL: "https://customermates.com",
      VERCEL_BRANCH_ORIGIN: undefined,
    });

    await import("../better-auth");

    expect(mocks.oAuthProxy).toHaveBeenCalledWith({
      currentURL: "https://customermates.com",
      productionURL: "https://customermates.com",
      secret: "shared-proxy-secret",
    });
  });

  it("leaves self-hosted installations on direct OAuth when the proxy is omitted", async () => {
    Object.assign(mocks.env, {
      APP_MODE: "self-hosted",
      BASE_URL: "https://crm.example.com",
      OAUTH_PROXY_SECRET: undefined,
      OAUTH_PROXY_URL: undefined,
      PREVIEW_DOMAIN: undefined,
      VERCEL_BRANCH_ORIGIN: undefined,
    });

    await import("../better-auth");

    expect(mocks.oAuthProxy).not.toHaveBeenCalled();
    expect(mocks.betterAuth.mock.calls[0]?.[0]).toMatchObject({ trustedOrigins: ["https://crm.example.com"] });
  });
});
