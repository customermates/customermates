import type { NextRequest } from "next/server";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  isProtectedPage: vi.fn<(request: NextRequest) => boolean>(),
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
  isProtectedPage: mocks.isProtectedPage,
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

import { sessionHintCookie } from "@/features/auth/session-hint";
import proxy from "@/proxy";
import { SYNTHETIC_SEED_USER } from "@/core/config/synthetic-seed-user";

const SESSION_TOKEN_COOKIE = "app.session_token=synthetic-token; Path=/; HttpOnly; SameSite=Lax";
const SESSION_DATA_COOKIE = "app.session_data=synthetic-cache; Path=/; HttpOnly; SameSite=Lax";
const CLEARED_SESSION_COOKIE = "app.session_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax";
const NOW = Date.UTC(2026, 9, 30, 12, 0, 0);
const MARKER = String(NOW / 1000);
const STALE_MARKER = String(NOW / 1000 - 10 * 60);
const DEMO_SESSION: SessionResult = {
  session: { expiresAt: new Date(NOW + 60 * 60_000) },
  user: { email: SYNTHETIC_SEED_USER.email },
};

function request(pathname: string, cookie?: string, origin = "http://localhost:4000"): NextRequest {
  return new NextRequestValue(`${origin}${pathname}`, {
    headers: cookie ? { cookie } : undefined,
  });
}

function embeddedRequest(pathname: string, cookie?: string, origin = "http://localhost:4000"): NextRequest {
  const headers: Record<string, string> = { "sec-fetch-dest": "iframe" };
  if (cookie) headers.cookie = cookie;
  return new NextRequestValue(`${origin}${pathname}`, { headers });
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
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
    mockEnv.APP_MODE = "demo";
    mockEnv.AUTH_ALLOWED_HOSTS = [
      "localhost:4000",
      "*.customermates.com",
      "customermates-git-feat-inbox-customermates.vercel.app",
    ];
    mockEnv.BASE_URL = "http://localhost:4000";
    mocks.intlMiddleware.mockImplementation(() => NextResponse.next());
    mocks.isPublicPage.mockReturnValue(false);
    mocks.isContentPage.mockReturnValue(false);
    mocks.isProtectedPage.mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips an unauthenticated visitor through a same-URL redirect carrying every auth cookie", async () => {
    mocks.signInEmail.mockResolvedValue(responseWithCookies(200, [SESSION_TOKEN_COOKIE, SESSION_DATA_COOKIE]));
    const incomingRequest = request("/en/dashboard?agentChat=closed");

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
    expect(response.headers.get("location")).toBe(
      `http://localhost:4000/en/dashboard?agentChat=closed&cm_demo_auth=${MARKER}`,
    );
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

  it("keeps an explicit German demo route even when the shared seed session has an English locale cookie", async () => {
    mocks.getSession.mockResolvedValue({
      session: { expiresAt: new Date(Date.now() + 60_000) },
      user: { email: SYNTHETIC_SEED_USER.email },
    });
    const incomingRequest = request(
      "/de/dashboard?agentChat=closed",
      "app.session_token=existing-synthetic-token; APP_LOCALE=en",
    );

    const response = await proxy(incomingRequest);

    expect(mocks.intlMiddleware).toHaveBeenCalledOnce();
    expect(mocks.intlMiddleware).toHaveBeenCalledWith(incomingRequest);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
  });

  it("preserves the agent chat override when the localized demo root redirects to the dashboard", async () => {
    mocks.getSession.mockResolvedValue({
      session: { expiresAt: new Date(Date.now() + 60_000) },
      user: { email: SYNTHETIC_SEED_USER.email },
    });

    const response = await proxy(request("/en?agentChat=closed", "app.session_token=existing-synthetic-token"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:4000/en/dashboard?agentChat=closed");
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
    expect(response.headers.get("location")).toBe(`http://localhost:4000/en/inbox?cm_demo_auth=${MARKER}`);
    expect(setCookieHeaders(response)).toEqual([
      CLEARED_SESSION_COOKIE,
      SESSION_TOKEN_COOKIE,
      SESSION_DATA_COOKIE,
      sessionHintCookie(),
    ]);
    expect(mocks.intlMiddleware).not.toHaveBeenCalled();
  });

  it("marks the redirect when the demo is embedded, so a frame that cannot store the cookie stops after one attempt", async () => {
    mocks.signInEmail.mockResolvedValue(responseWithCookies(200, [SESSION_TOKEN_COOKIE, SESSION_DATA_COOKIE]));

    const response = await proxy(embeddedRequest("/en/dashboard?agentChat=open"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `http://localhost:4000/en/dashboard?agentChat=open&cm_demo_auth=${MARKER}`,
    );
  });

  it("stops signing in when an embedded frame comes back unauthenticated a second time", async () => {
    const response = await proxy(embeddedRequest(`/en/dashboard?agentChat=open&cm_demo_auth=${MARKER}`));

    expect(mocks.signInEmail).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("/auth/signin");
  });

  it("renders an embedded frame whose cookie stuck without another hop to drop the marker", async () => {
    mocks.getSession.mockResolvedValue(DEMO_SESSION);

    const response = await proxy(
      embeddedRequest(`/en/dashboard?agentChat=open&cm_demo_auth=${MARKER}`, "app.session_token=synthetic-token"),
    );

    expect(mocks.signInEmail).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.intlMiddleware).toHaveBeenCalledOnce();
  });

  it.each(["/en/dashboard", "/en/w/small-business/dashboard", "/en"])(
    "ends the chain of a client that keeps no cookies on %s after one sign-in",
    async (startPath) => {
      mocks.isContentPage.mockImplementation((req) => req.nextUrl.pathname === "/en");
      mocks.isPublicPage.mockImplementation((req) => req.nextUrl.pathname.includes("/auth/"));
      mocks.isProtectedPage.mockImplementation((req) => !req.nextUrl.pathname.includes("/auth/"));
      mocks.signInEmail.mockResolvedValue(responseWithCookies(200, [SESSION_TOKEN_COOKIE, SESSION_DATA_COOKIE]));

      let url = `http://localhost:4000${startPath}`;
      let redirects = 0;
      for (; redirects < 10; redirects += 1) {
        const location = (await proxy(new NextRequestValue(url))).headers.get("location");
        if (!location) break;
        url = location;
      }

      expect(redirects).toBeLessThanOrEqual(2);
      expect(mocks.signInEmail).toHaveBeenCalledOnce();
      expect(mocks.intlMiddleware).toHaveBeenCalledOnce();
    },
  );

  it("sends a browser that kept the cookie once more to the same URL without the marker", async () => {
    mocks.getSession.mockResolvedValue(DEMO_SESSION);

    const response = await proxy(
      request(`/en/w/small-business/dashboard?agentChat=closed&cm_demo_auth=${MARKER}`, "app.session_token=t"),
    );

    expect(mocks.signInEmail).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:4000/en/w/small-business/dashboard?agentChat=closed",
    );
  });

  it("walks a browser that keeps cookies from the bare URL to the rendered page on a clean URL", async () => {
    mocks.signInEmail.mockResolvedValue(responseWithCookies(200, [SESSION_TOKEN_COOKIE, SESSION_DATA_COOKIE]));
    mocks.getSession.mockResolvedValue(DEMO_SESSION);

    const first = await proxy(request("/en/w/small-business/dashboard"));
    const second = await proxy(
      new NextRequestValue(first.headers.get("location") ?? "", {
        headers: { cookie: "app.session_token=synthetic-token" },
      }),
    );
    const finalUrl = second.headers.get("location") ?? "";
    const third = await proxy(
      new NextRequestValue(finalUrl, { headers: { cookie: "app.session_token=synthetic-token" } }),
    );

    expect(mocks.signInEmail).toHaveBeenCalledOnce();
    expect(finalUrl).toBe("http://localhost:4000/en/w/small-business/dashboard");
    expect(third.headers.get("location")).toBeNull();
    expect(mocks.intlMiddleware).toHaveBeenCalledOnce();
  });

  it("drops the marker when the signed-in demo root moves on to the dashboard", async () => {
    mocks.isContentPage.mockReturnValue(true);
    mocks.getSession.mockResolvedValue(DEMO_SESSION);

    const response = await proxy(request(`/en?agentChat=closed&cm_demo_auth=${MARKER}`, "app.session_token=t"));

    expect(response.headers.get("location")).toBe("http://localhost:4000/en/dashboard?agentChat=closed");
  });

  it.each(["1", STALE_MARKER])(
    "signs a fresh browser in from a shared link whose marker %s is not from a recent redirect",
    async (marker) => {
      mocks.signInEmail.mockResolvedValue(responseWithCookies(200, [SESSION_TOKEN_COOKIE, SESSION_DATA_COOKIE]));

      const response = await proxy(request(`/en/w/small-business/dashboard?cm_demo_auth=${marker}`));

      expect(mocks.signInEmail).toHaveBeenCalledOnce();
      expect(response.headers.get("location")).toBe(
        `http://localhost:4000/en/w/small-business/dashboard?cm_demo_auth=${MARKER}`,
      );
    },
  );

  it("keeps the marker on the sign-in page so a cookie-less client is not signed in there again", async () => {
    const response = await proxy(request(`/en/dashboard?cm_demo_auth=${MARKER}`));

    expect(mocks.signInEmail).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `http://localhost:4000/en/auth/signin?callbackURL=${encodeURIComponent(
        `http://localhost:4000/en/dashboard?cm_demo_auth=${MARKER}`,
      )}&cm_demo_auth=${MARKER}`,
    );
  });

  it("serves a public marketing page on the demo host without minting a session", async () => {
    mocks.isContentPage.mockReturnValue(true);

    const response = await proxy(request("/en/terms"));

    expect(mocks.signInEmail).not.toHaveBeenCalled();
    expect(mocks.intlMiddleware).toHaveBeenCalledOnce();
    expect(response.headers.get("location")).toBeNull();
  });

  it("still sends the demo root to the dashboard even though the root is a content page", async () => {
    mocks.isContentPage.mockReturnValue(true);
    mocks.signInEmail.mockResolvedValue(responseWithCookies(200, [SESSION_TOKEN_COOKIE, SESSION_DATA_COOKIE]));

    const response = await proxy(request("/en"));

    expect(mocks.signInEmail).toHaveBeenCalledOnce();
    expect(response.status).toBe(307);
  });

  it("recognises the __Secure- prefixed session cookie that https actually sets", async () => {
    mocks.getSession.mockResolvedValue({
      session: { expiresAt: new Date(Date.now() + 60_000) },
      user: { email: SYNTHETIC_SEED_USER.email },
    });

    await proxy(request("/en/dashboard", "__Secure-app.session_token=existing-synthetic-token"));

    expect(mocks.getSession).toHaveBeenCalledOnce();
    expect(mocks.signInEmail).not.toHaveBeenCalled();
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

  it("hands a signed-out request for a path no route serves to the app router, which answers 404", async () => {
    mockEnv.APP_MODE = "cloud";
    mocks.isProtectedPage.mockReturnValue(false);

    const response = await proxy(request("/en/this-page-does-not-exist"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(mocks.intlMiddleware).toHaveBeenCalledOnce();
  });

  it("still sends a signed-out request for a protected detail page to sign-in with its callback", async () => {
    mockEnv.APP_MODE = "cloud";

    const response = await proxy(request("/de/contacts/40000000-0000-4000-8000-000000000001?tab=notes"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `http://localhost:4000/de/auth/signin?callbackURL=${encodeURIComponent(
        "http://localhost:4000/de/contacts/40000000-0000-4000-8000-000000000001?tab=notes",
      )}`,
    );
  });

  it("answers an OPTIONS request for a page with its methods instead of rendering the page", async () => {
    mockEnv.APP_MODE = "cloud";

    const response = await proxy(
      new NextRequestValue("http://localhost:4000/en/dashboard", {
        method: "OPTIONS",
        headers: { cookie: "app.session_token=member", "sec-fetch-mode": "cors" },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("allow")).toBe("GET, HEAD, POST");
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.intlMiddleware).not.toHaveBeenCalled();
  });

  it("never asks whether a signed-in request is protected, so signed-in routing is unchanged", async () => {
    mockEnv.APP_MODE = "cloud";
    mocks.getSession.mockResolvedValue({
      session: { expiresAt: new Date(Date.now() + 60_000) },
      user: { email: "member@example.com" },
    });

    const response = await proxy(request("/en/this-page-does-not-exist", "app.session_token=member"));

    expect(response.status).toBe(200);
    expect(mocks.isProtectedPage).not.toHaveBeenCalled();
  });

  it("negotiates an unprefixed content path among the content locales without a session lookup", async () => {
    mockEnv.APP_MODE = "cloud";
    mocks.isContentPage.mockReturnValue(true);
    mocks.getSession.mockResolvedValue({
      session: { expiresAt: new Date(Date.now() + 60_000) },
      user: { email: "member@example.com" },
    });
    mocks.intlMiddleware.mockImplementation(() =>
      NextResponse.redirect("http://localhost:4000/de/docs/self-hosting?ref=hn", 307),
    );

    const response = await proxy(request("/docs/self-hosting?ref=hn", "app.session_token=member; APP_LOCALE=de"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:4000/de/docs/self-hosting?ref=hn");
    expect(response.headers.get("vary")).toBe("accept-language, cookie");
    expect(mocks.getSession, "a content locale redirect needs no session lookup").not.toHaveBeenCalled();
    expect(mocks.intlMiddleware).toHaveBeenCalledOnce();
  });

  it("keeps an unprefixed application path on the signed-in reader's preferred locale", async () => {
    mockEnv.APP_MODE = "cloud";
    mocks.getSession.mockResolvedValue({
      session: { expiresAt: new Date(Date.now() + 60_000) },
      user: { email: "member@example.com" },
    });

    const response = await proxy(request("/dashboard", "app.session_token=member; APP_LOCALE=de"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:4000/de/dashboard");
  });

  it.each([
    ["/de", "http://localhost:4000/de/dashboard"],
    ["/fr?welcome=1", "http://localhost:4000/fr/dashboard?welcome=1"],
  ])("sends a signed-in reader from the %s root straight to the localized dashboard", async (path, location) => {
    mockEnv.APP_MODE = "cloud";
    mocks.getSession.mockResolvedValue({
      session: { expiresAt: new Date(Date.now() + 60_000) },
      user: { email: "member@example.com" },
    });

    const response = await proxy(request(path, "app.session_token=member"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(location);
  });

  it.each([
    ["/en/inbox?threadId=t1", "/en/dashboard?open=%2Finbox&threadId=t1"],
    [
      "/en/records/30000000-0000-4000-8000-000000000001/40000000-0000-4000-8000-000000000001?tab=notes",
      "/en/dashboard?open=%2Frecords%2F30000000-0000-4000-8000-000000000001%2F40000000-0000-4000-8000-000000000001&tab=notes",
    ],
    ["/en/settings/billing", "/en/dashboard?open=%2Fsettings%2Fbilling"],
    ["/en/wiki?page=p1", "/en/dashboard?open=%2Fwiki&page=p1"],
  ])("sends the unslugged app link %s through the workspace entry", async (path, location) => {
    mockEnv.APP_MODE = "cloud";
    mocks.getSession.mockResolvedValue({
      session: { expiresAt: new Date(Date.now() + 60_000) },
      user: { email: "member@example.com" },
    });

    const response = await proxy(request(path, "app.session_token=member"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`http://localhost:4000${location}`);
    expect(mocks.intlMiddleware).not.toHaveBeenCalled();
  });

  it("sends a signed-out unslugged app link to sign-in with the original path as callback", async () => {
    mockEnv.APP_MODE = "cloud";

    const response = await proxy(request("/en/settings/profile?x=1"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `http://localhost:4000/en/auth/signin?callbackURL=${encodeURIComponent("http://localhost:4000/en/settings/profile?x=1")}`,
    );
  });

  it("prefers the signed-in reader's saved locale over the root they finished onboarding on", async () => {
    mockEnv.APP_MODE = "cloud";
    mocks.getSession.mockResolvedValue({
      session: { expiresAt: new Date(Date.now() + 60_000) },
      user: { email: "member@example.com" },
    });

    const response = await proxy(request("/en", "app.session_token=member; APP_LOCALE=it"));

    expect(response.headers.get("location")).toBe("http://localhost:4000/it/dashboard");
  });

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
    mocks.isProtectedPage.mockReturnValue(true);
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
