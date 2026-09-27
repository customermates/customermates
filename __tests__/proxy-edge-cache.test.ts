import type { NextRequest } from "next/server";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest as NextRequestValue } from "next/server";

const mockEnv = vi.hoisted(() => ({
  APP_MODE: "self-hosted" as const,
  AUTH_ALLOWED_HOSTS: ["localhost:4000"],
  BASE_URL: "http://localhost:4000",
}));
const authMocks = vi.hoisted(() => ({ getSession: vi.fn(), signInEmail: vi.fn(), signOut: vi.fn() }));

vi.mock("@/env", () => ({ env: mockEnv }));

vi.mock("@/core/auth/better-auth", () => ({
  auth: { api: authMocks },
}));

import proxy from "@/proxy";
import { SESSION_HINT_COOKIE_NAME } from "@/features/auth/session-hint";

function request(pathname: string, cookie?: string): NextRequest {
  const headers = new Headers({ "accept-language": "en-US,en;q=0.9" });
  if (cookie) headers.set("cookie", cookie);
  return new NextRequestValue(`http://localhost:4000${pathname}`, { headers });
}

async function call(pathname: string, cookie?: string) {
  const response = await proxy(request(pathname, cookie));
  return {
    location: response.headers.get("location"),
    rewrite: response.headers.get("x-middleware-rewrite"),
    setCookies: response.headers.getSetCookie(),
    status: response.status,
  };
}

function validSession() {
  authMocks.getSession.mockResolvedValue({
    session: { expiresAt: new Date(Date.now() + 60_000) },
    user: { email: "hint@example.com" },
  });
}

describe("proxy session hint", () => {
  beforeEach(() => {
    authMocks.getSession.mockReset();
    authMocks.getSession.mockResolvedValue(null);
  });

  it("sets no cookie for a signed-out visitor without a hint", async () => {
    const result = await call("/en/pricing");

    expect(result.status).toBe(200);
    expect(result.setCookies).toEqual([]);
    expect(authMocks.getSession).not.toHaveBeenCalled();
  });

  it("marks a signed-in browser once so static marketing pages can ask for its account state", async () => {
    validSession();

    const first = await call("/en/pricing", "app.session_token=session");
    expect(first.setCookies).toHaveLength(1);
    expect(first.setCookies[0]).toMatch(new RegExp(`^${SESSION_HINT_COOKIE_NAME.replace(".", "\\.")}=1;`));
    expect(first.setCookies[0]).not.toMatch(/HttpOnly/iu);

    const second = await call("/en/pricing", `app.session_token=session; ${SESSION_HINT_COOKIE_NAME}=1`);
    expect(second.setCookies).toEqual([]);
  });

  it("clears a hint whose session is gone, including on redirects", async () => {
    const expired = await call("/en/pricing", `app.session_token=stale; ${SESSION_HINT_COOKIE_NAME}=1`);
    expect(expired.setCookies).toHaveLength(1);
    expect(expired.setCookies[0]).toMatch(new RegExp(`^${SESSION_HINT_COOKIE_NAME.replace(".", "\\.")}=;`));

    const redirected = await call("/en/dashboard", `${SESSION_HINT_COOKIE_NAME}=1`);
    expect(redirected.status).toBe(307);
    expect(redirected.setCookies.some((cookie) => cookie.startsWith(`${SESSION_HINT_COOKIE_NAME}=;`))).toBe(true);
  });
});

describe("proxy legacy hub page queries", () => {
  beforeEach(() => {
    authMocks.getSession.mockReset();
    authMocks.getSession.mockResolvedValue(null);
  });

  it("permanently redirects a page query to the paginated path, keeping unrelated parameters", async () => {
    const paged = await call("/de/blog?page=2&utm_source=proof");
    expect(paged.status).toBe(308);
    expect(paged.location).toBe("http://localhost:4000/de/blog/page/2?utm_source=proof");

    const pageOne = await call("/en/features/all?page=1&tag=a&tag=b");
    expect(pageOne.status).toBe(308);
    expect(pageOne.location).toBe("http://localhost:4000/en/features/all?tag=a&tag=b");
  });

  it("serves a malformed or repeated page query as a missing page", async () => {
    for (const query of ["page=2junk", "page=2&page=3", "page=0"]) {
      const result = await call(`/en/compare?${query}`);
      expect(result.location, query).toBeNull();
      expect(result.rewrite, query).toBe("http://localhost:4000/en/compare/page/0");
    }
  });

  it("leaves hub pages without a page query and non-hub pages untouched", async () => {
    for (const path of ["/en/blog", "/en/blog/page/2", "/en/pricing?page=2", "/en/blog/some-post?page=2"]) {
      const result = await call(path);
      expect(result.status, path).toBe(200);
      expect(result.location, path).toBeNull();
      expect(result.rewrite, path).toBeNull();
    }
  });
});
