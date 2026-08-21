import type { NextRequest } from "next/server";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest as NextRequestValue, NextResponse } from "next/server";

type SessionResult = {
  session: { expiresAt: Date };
  user: { email: string };
};

const mocks = vi.hoisted(() => ({
  getSession: vi.fn<(input: unknown) => Promise<SessionResult | null>>(),
  intlMiddleware: vi.fn<(request: NextRequest) => NextResponse>(),
  isPublicPage: vi.fn<(request: NextRequest) => boolean>(),
  isContentPage: vi.fn<(request: NextRequest) => boolean>(),
  signInEmail: vi.fn<(input: unknown) => Promise<Response>>(),
  signOut: vi.fn<(input: unknown) => Promise<Response>>(),
}));
const mockEnv = vi.hoisted(() => ({
  APP_MODE: "demo" as "cloud" | "demo",
  AUTH_ALLOWED_HOSTS: [
    "localhost:4000",
    "*.customermates.com",
    "customermates-git-feat-inbox-customermates.vercel.app",
  ],
  BASE_URL: "http://localhost:4000",
}));

vi.mock("next-intl/middleware", () => ({
  default: () => mocks.intlMiddleware,
}));

vi.mock("@/i18n/routing", () => ({
  appRouting: {},
  isPublicPage: mocks.isPublicPage,
  isContentPage: mocks.isContentPage,
  contentRouting: {},
}));

vi.mock("@/env", () => ({
  env: mockEnv,
}));

vi.mock("@/core/auth/better-auth", () => ({
  auth: {
    api: {
      getSession: mocks.getSession,
      signInEmail: mocks.signInEmail,
      signOut: mocks.signOut,
    },
  },
}));

import proxy from "@/proxy";
import { SYNTHETIC_SEED_USER } from "@/core/config/synthetic-seed-user";

const SESSION_TOKEN_COOKIE = "app.session_token=synthetic-token; Path=/; HttpOnly; SameSite=Lax";
const SESSION_DATA_COOKIE = "app.session_data=synthetic-cache; Path=/; HttpOnly; SameSite=Lax";
const CLEARED_SESSION_COOKIE = "app.session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax";

function request(pathname: string, cookie?: string, origin = "http://localhost:4000"): NextRequest {
  return new NextRequestValue(`${origin}${pathname}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

function responseWithCookies(status: number, cookies: string[]): Response {
  const headers = new Headers();
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status, headers });
}

function setCookieHeaders(response: Response): string[] {
  const headers = response.headers as Headers & {
    getSetCookie: () => string[];
  };
  return headers.getSetCookie();
}

describe("automatic demo authentication proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.APP_MODE = "demo";
    mockEnv.AUTH_ALLOWED_HOSTS = [
      "localhost:4000",
      "*.customermates.com",
      "customermates-git-feat-inbox-customermates.vercel.app",
    ];
    mockEnv.BASE_URL = "http://localhost:4000";
    mocks.intlMiddleware.mockImplementation(() => NextResponse.next());
    mocks.isPublicPage.mockReturnValue(false);
  });

  it("round-trips an unauthenticated visitor through a same-URL redirect carrying every auth cookie", async () => {
    mocks.signInEmail.mockResolvedValue(responseWithCookies(200, [SESSION_TOKEN_COOKIE, SESSION_DATA_COOKIE]));
    const incomingRequest = request("/en/dashboard?view=demo");

    const response = await proxy(incomingRequest);

    expect(mocks.signInEmail).toHaveBeenCalledOnce();
    expect(mocks.signInEmail).toHaveBeenCalledWith({
      headers: incomingRequest.headers,
      body: {
        email: SYNTHETIC_SEED_USER.email,
        password: SYNTHETIC_SEED_USER.password,
        rememberMe: true,
      },
      asResponse: true,
    });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:4000/en/dashboard?view=demo");
    expect(setCookieHeaders(response)).toEqual([SESSION_TOKEN_COOKIE, SESSION_DATA_COOKIE]);
    expect(mocks.intlMiddleware).not.toHaveBeenCalled();
    expect(mocks.isPublicPage).not.toHaveBeenCalled();
  });

  it("renders the requested route when the authenticated session belongs to the seed user", async () => {
    mocks.getSession.mockResolvedValue({
      session: { expiresAt: new Date(Date.now() + 60_000) },
      user: { email: SYNTHETIC_SEED_USER.email },
    });
    const incomingRequest = request("/en/dashboard", "app.session_token=existing-synthetic-token");

    const response = await proxy(incomingRequest);

    expect(mocks.getSession).toHaveBeenCalledWith({
      headers: incomingRequest.headers,
    });
    expect(mocks.signInEmail).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.intlMiddleware).toHaveBeenCalledOnce();
    expect(mocks.intlMiddleware).toHaveBeenCalledWith(incomingRequest);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("replaces a non-demo session and forwards both the sign-out and sign-in cookies", async () => {
    mocks.getSession.mockResolvedValue({
      session: { expiresAt: new Date(Date.now() + 60_000) },
      user: { email: "someone-else@example.com" },
    });
    mocks.signOut.mockResolvedValue(responseWithCookies(200, [CLEARED_SESSION_COOKIE]));
    mocks.signInEmail.mockResolvedValue(responseWithCookies(200, [SESSION_TOKEN_COOKIE, SESSION_DATA_COOKIE]));
    const incomingRequest = request("/en/inbox", "app.session_token=non-demo-synthetic-token");

    const response = await proxy(incomingRequest);

    expect(mocks.signOut).toHaveBeenCalledWith({
      headers: incomingRequest.headers,
      asResponse: true,
    });
    expect(mocks.signInEmail).toHaveBeenCalledOnce();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:4000/en/inbox");
    expect(setCookieHeaders(response)).toEqual([CLEARED_SESSION_COOKIE, SESSION_TOKEN_COOKIE, SESSION_DATA_COOKIE]);
    expect(mocks.intlMiddleware).not.toHaveBeenCalled();
  });

  it("fails closed without rendering when automatic sign-in is rejected", async () => {
    mocks.signInEmail.mockResolvedValue(new Response(null, { status: 401 }));

    await expect(proxy(request("/en/dashboard"))).rejects.toThrow("Automatic demo authentication failed");

    expect(mocks.intlMiddleware).not.toHaveBeenCalled();
    expect(mocks.isPublicPage).not.toHaveBeenCalled();
  });

  it.each(["https://customermates-git-feat-inbox-customermates.vercel.app", "https://feat-inbox.customermates.com"])(
    "keeps an unauthenticated redirect on the validated Preview origin %s",
    async (origin) => {
      mockEnv.APP_MODE = "cloud";
      mockEnv.BASE_URL = "https://customermates-git-feat-inbox-customermates.vercel.app";

      const response = await proxy(request("/en/dashboard?view=board", undefined, origin));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        `${origin}/en/auth/signin?callbackURL=${encodeURIComponent(`${origin}/en/dashboard?view=board`)}`,
      );
    },
  );

  it("falls back to the configured deployment origin for an untrusted request host", async () => {
    mockEnv.APP_MODE = "cloud";
    mockEnv.BASE_URL = "https://customermates-git-feat-inbox-customermates.vercel.app";

    const response = await proxy(request("/en/dashboard", undefined, "https://attacker.example"));

    expect(response.headers.get("location")).toBe(
      "https://customermates-git-feat-inbox-customermates.vercel.app/en/auth/signin?callbackURL=https%3A%2F%2Fcustomermates-git-feat-inbox-customermates.vercel.app%2Fen%2Fdashboard",
    );
  });
});

describe("MCP OAuth authorization proxy", () => {
  const loopbackRedirectUri = "http://127.0.0.1:54754/callback/4FEaTo4rPQf2";
  const authorizePath =
    "/api/auth/mcp/authorize?response_type=code&client_id=codex-test-client" +
    `&redirect_uri=${encodeURIComponent(loopbackRedirectUri)}` +
    "&code_challenge=test-challenge&code_challenge_method=S256";

  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.APP_MODE = "cloud";
    mockEnv.AUTH_ALLOWED_HOSTS = ["customermates.com", "*.customermates.com"];
    mockEnv.BASE_URL = "https://customermates.com";
    mocks.intlMiddleware.mockImplementation(() => NextResponse.next());
    mocks.isPublicPage.mockReturnValue(false);
  });

  it("preserves a loopback redirect URI inside the unauthenticated sign-in callback", async () => {
    const response = await proxy(request(authorizePath, undefined, "https://customermates.com"));

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    if (!location) throw new Error("Expected the proxy to redirect to sign-in");
    const signInUrl = new URL(location);
    const callback = signInUrl.searchParams.get("callbackURL");
    if (!callback) throw new Error("Expected the sign-in redirect to retain its callback URL");
    const callbackUrl = new URL(callback, "https://customermates.com");

    expect(signInUrl.pathname).toBe("/auth/signin");
    expect(callbackUrl.pathname).toBe("/api/auth/mcp/authorize");
    expect(callbackUrl.searchParams.get("redirect_uri")).toBe(loopbackRedirectUri);
    expect(callbackUrl.searchParams.get("prompt")).toBe("consent");
  });

  it("preserves a loopback redirect URI when an authenticated consent request passes through", async () => {
    mocks.getSession.mockResolvedValue({
      session: { expiresAt: new Date(Date.now() + 60_000) },
      user: { email: "codex-user@example.com" },
    });
    const incomingRequest = request(
      `${authorizePath}&prompt=consent`,
      "app.session_token=codex-session",
      "https://customermates.com",
    );

    const response = await proxy(incomingRequest);

    expect(mocks.getSession).toHaveBeenCalledWith({ headers: incomingRequest.headers });
    expect(incomingRequest.nextUrl.searchParams.get("redirect_uri")).toBe(loopbackRedirectUri);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });
});
