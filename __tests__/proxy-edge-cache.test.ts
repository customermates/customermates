import type { NextRequest } from "next/server";

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

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
import { NOT_FOUND_PAGE_PATH } from "@/core/seo/missing-content-page";
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
      expect(result.rewrite, query).toBe("http://localhost:4000/en/_missing-page");
    }
  });

  it("leaves hub pages without a page query and non-hub pages untouched", async () => {
    for (const path of ["/en/blog", "/en/blog/page/2", "/en/pricing?page=2", "/en/blog/open-source-crm?page=2"]) {
      const result = await call(path);
      expect(result.status, path).toBe(200);
      expect(result.location, path).toBeNull();
      expect(result.rewrite, path).toBeNull();
    }
  });
});

describe("proxy missing content pages", () => {
  beforeEach(() => {
    authMocks.getSession.mockReset();
    authMocks.getSession.mockResolvedValue(null);
  });

  it("renders the localized not-found route for a missing slug or hub page instead of a client-only 404 shell", async () => {
    for (const path of [
      "/en/blog/unknown-slug",
      "/de/compare/unknown",
      "/en/for/unknown",
      "/en/features/unknown",
      "/de/docs/unknown",
      "/en/docs/openapi/unknown",
      "/en/blog/page/99",
      "/en/compare/page/1",
      "/en/features/all/page/abc",
    ]) {
      const result = await call(path);
      expect(result.location, path).toBeNull();
      expect(result.rewrite, path).toBe(`http://localhost:4000/${path.split("/")[1]}/_missing-page`);
    }
  });

  it("rewrites to a localized path no route matches, never to Next's internal /_not-found", async () => {
    // Vercel served a proxy rewrite to /_not-found as an ordinary page with status 200, while
    // `next start` answered 404, so every missing slug was a soft 404 in production only. An
    // unmatched path gets Next's own 404 handling on every host, the same as /en/this-does-not-exist.
    expect(readFileSync(join(process.cwd(), "proxy.ts"), "utf8")).not.toContain('"/_not-found"');
    expect(NOT_FOUND_PAGE_PATH).toMatch(/^\/_[a-z-]+$/u);

    // A dynamic or catch-all segment directly under the locale would match the target and turn every
    // missing page back into a 200, so none may exist there, including inside route groups.
    const localeRoot = join(process.cwd(), "app/[locale]");
    const topLevelSegments = readdirSync(localeRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap(({ name }) =>
        name.startsWith("(")
          ? readdirSync(join(localeRoot, name), { withFileTypes: true })
              .filter((entry) => entry.isDirectory())
              .map((entry) => entry.name)
          : [name],
      );
    expect(topLevelSegments.filter((name) => name.startsWith("["))).toEqual([]);

    for (const path of ["/xx", "/zz/x", "/en/blog/does-not-exist", "/en/blog/page/999", "/de/for/unknown"]) {
      const result = await call(path);
      expect(result.location, path).toBeNull();
      expect(new URL(result.rewrite ?? "").pathname, path).toMatch(/^\/(en|de)\/_missing-page$/u);
    }
  });

  it("passes existing content pages and hubs through", async () => {
    for (const path of [
      "/en/blog/open-source-crm",
      "/de/compare/twenty-alternative",
      "/en/features/all",
      "/en/docs/openapi",
      "/en/docs/mcp",
    ]) {
      const result = await call(path);
      expect(result.status, path).toBe(200);
      expect(result.rewrite, path).toBeNull();
    }
  });
});
