import type { NextRequest } from "next/server";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest as NextRequestValue, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  intlMiddleware: vi.fn<(request: NextRequest) => NextResponse>(),
}));

vi.mock("next-intl/middleware", () => ({
  default: () => mocks.intlMiddleware,
}));

vi.mock("@/env", () => ({
  env: { APP_MODE: "cloud", AUTH_ALLOWED_HOSTS: ["localhost:4000"], BASE_URL: "http://localhost:4000" },
}));

vi.mock("@/core/auth/better-auth", () => ({
  auth: { api: { getSession: mocks.getSession, signInEmail: vi.fn(), signOut: vi.fn() } },
}));

import proxy from "@/proxy";
import { WORKSPACE_HEADER } from "@/core/navigation/workspace-paths";

const SESSION_COOKIE = "app.session_token=token";

function request(pathname: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequestValue(`http://localhost:4000${pathname}`, { headers: { cookie: SESSION_COOKIE, ...headers } });
}

function forwardedWorkspace(response: Response): string | null {
  return response.headers.get(`x-middleware-request-${WORKSPACE_HEADER}`);
}

function overridesHeaders(response: Response): string[] {
  return (response.headers.get("x-middleware-override-headers") ?? "").split(",").filter(Boolean);
}

describe("proxy workspace header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      session: { expiresAt: new Date(Date.now() + 60_000) },
      user: { email: "ben@example.com" },
    });
    mocks.intlMiddleware.mockImplementation((req) => NextResponse.next({ request: { headers: req.headers } }));
  });

  it("derives the workspace of a page request from its URL and ignores a forged header", async () => {
    await proxy(request("/en/w/alpha/records/contacts", { [WORKSPACE_HEADER]: "beta" }));

    const forwarded = mocks.intlMiddleware.mock.calls[0]?.[0];
    expect(forwarded?.headers.get(WORKSPACE_HEADER)).toBe("alpha");
  });

  it("removes a forged header from a page request without a workspace in its URL", async () => {
    await proxy(request("/en/operator/overview", { [WORKSPACE_HEADER]: "beta" }));

    const forwarded = mocks.intlMiddleware.mock.calls[0]?.[0];
    expect(forwarded?.headers.has(WORKSPACE_HEADER)).toBe(false);
  });

  it("derives the workspace of a prefetch from its URL without authenticating it", async () => {
    const response = await proxy(
      request("/en/w/alpha/dashboard", { "next-router-prefetch": "1", [WORKSPACE_HEADER]: "beta" }),
    );

    expect(forwardedWorkspace(response)).toBe("alpha");
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.intlMiddleware).not.toHaveBeenCalled();
  });

  it("strips a forged header from a prefetch of a page without a workspace", async () => {
    const response = await proxy(request("/en/onboarding", { purpose: "prefetch", [WORKSPACE_HEADER]: "beta" }));

    expect(overridesHeaders(response)).not.toContain(WORKSPACE_HEADER);
    expect(forwardedWorkspace(response)).toBeNull();
  });

  it("rewrites a workspace API path to its route and forwards the workspace", async () => {
    const response = await proxy(request("/api/w/alpha/agent/messages", { [WORKSPACE_HEADER]: "beta" }));

    expect(new URL(response.headers.get("x-middleware-rewrite") ?? "").pathname).toBe("/api/agent/messages");
    expect(forwardedWorkspace(response)).toBe("alpha");
  });

  it("forwards other API requests without any workspace header", async () => {
    const response = await proxy(request("/api/v1/records/export", { [WORKSPACE_HEADER]: "beta" }));

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(overridesHeaders(response)).not.toContain(WORKSPACE_HEADER);
  });

  it("ignores a workspace segment that is not a valid slug", async () => {
    await proxy(request("/en/w/Not_A_Slug/dashboard"));

    const forwarded = mocks.intlMiddleware.mock.calls[0]?.[0];
    expect(forwarded?.headers.has(WORKSPACE_HEADER)).toBe(false);
  });
});
