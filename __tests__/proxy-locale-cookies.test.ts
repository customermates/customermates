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
import { APP_LOCALE_COOKIE_NAME, CONTENT_LOCALE_COOKIE_NAME } from "@/i18n/locale-preference";
import { appRouting, contentRouting } from "@/i18n/routing";

function request(pathname: string, options: { acceptLanguage?: string; cookie?: string } = {}): NextRequest {
  const headers = new Headers();
  if (options.acceptLanguage) headers.set("accept-language", options.acceptLanguage);
  if (options.cookie) headers.set("cookie", options.cookie);
  return new NextRequestValue(`http://localhost:4000${pathname}`, { headers });
}

async function call(pathname: string, options: { acceptLanguage?: string; cookie?: string } = {}) {
  const response = await proxy(request(pathname, options));
  return {
    location: response.headers.get("location"),
    response,
    setCookies:
      (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ??
      [response.headers.get("set-cookie")].filter((value): value is string => value !== null),
    status: response.status,
  };
}

describe("proxy locale preference cookies", () => {
  beforeEach(() => {
    authMocks.getSession.mockReset();
    authMocks.getSession.mockResolvedValue(null);
  });

  it("keeps application and content preference storage independent", () => {
    expect(appRouting.localeCookie).toBe(false);
    expect(contentRouting.localeCookie).toMatchObject({ name: CONTENT_LOCALE_COOKIE_NAME });
    expect(CONTENT_LOCALE_COOKIE_NAME).not.toBe(APP_LOCALE_COOKIE_NAME);
  });

  it("uses an explicit app preference ahead of the browser for locale-less app routes", async () => {
    const result = await call("/company/subscription?tab=billing", {
      acceptLanguage: "en-US,en;q=0.9",
      cookie: `${APP_LOCALE_COOKIE_NAME}=it`,
    });

    expect(result.status).toBe(307);
    expect(result.location).toBe("http://localhost:4000/it/company/subscription?tab=billing");
    expect(result.response.headers.get("vary")).toBe("accept-language, cookie");
  });

  it("uses the persisted app preference when an authenticated user crosses into the app", async () => {
    authMocks.getSession.mockResolvedValue({
      session: { expiresAt: new Date(Date.now() + 60_000) },
      user: { email: "locale-test@example.com" },
    });
    const cookie = `app.session_token=session; ${APP_LOCALE_COOKIE_NAME}=it; ${CONTENT_LOCALE_COOKIE_NAME}=de`;

    const bareRoot = await call("/", { acceptLanguage: "de-DE,de;q=0.9", cookie });
    expect(bareRoot.location).toBe("http://localhost:4000/it");

    const contentRoot = await call("/de", { acceptLanguage: "de-DE,de;q=0.9", cookie });
    expect(contentRoot.location).toBe("http://localhost:4000/it/dashboard");

    const protectedRoute = await call("/de/company/settings?tab=general", {
      acceptLanguage: "de-DE,de;q=0.9",
      cookie,
    });
    expect(protectedRoute.location).toBe("http://localhost:4000/it/company/settings?tab=general");
  });

  it("renegotiates System from the current browser language instead of sticking", async () => {
    const spanish = await call("/profile/settings", { acceptLanguage: "es-ES,es;q=0.9" });
    const french = await call("/profile/settings", { acceptLanguage: "fr-FR,fr;q=0.9" });

    expect(spanish.location).toBe("http://localhost:4000/es/profile/settings");
    expect(french.location).toBe("http://localhost:4000/fr/profile/settings");
  });

  it("does not overwrite the app preference while synchronizing a content locale", async () => {
    const content = await call("/en/terms", {
      acceptLanguage: "de-DE,de;q=0.9",
      cookie: `${APP_LOCALE_COOKIE_NAME}=it; ${CONTENT_LOCALE_COOKIE_NAME}=de`,
    });

    expect(content.setCookies.some((cookie) => cookie.startsWith(`${APP_LOCALE_COOKIE_NAME}=`))).toBe(false);
    expect(content.setCookies.some((cookie) => cookie.startsWith(`${CONTENT_LOCALE_COOKIE_NAME}=en`))).toBe(true);

    const app = await call("/dashboard", {
      acceptLanguage: "en-US,en;q=0.9",
      cookie: `${APP_LOCALE_COOKIE_NAME}=it; ${CONTENT_LOCALE_COOKIE_NAME}=en`,
    });
    expect(app.location).toBe("http://localhost:4000/it/dashboard");
  });

  it("remembers a content selection for later locale-less content navigation", async () => {
    const selection = await call("/de/terms", { acceptLanguage: "en-US,en;q=0.9" });
    expect(selection.setCookies.some((cookie) => cookie.startsWith(`${CONTENT_LOCALE_COOKIE_NAME}=de`))).toBe(true);

    const subsequent = await call("/pricing", {
      acceptLanguage: "en-US,en;q=0.9",
      cookie: `${CONTENT_LOCALE_COOKIE_NAME}=de`,
    });
    expect(subsequent.location).toBe("http://localhost:4000/de/pricing");
  });

  it("ignores stale or cross-domain locale cookie values safely", async () => {
    const staleApp = await call("/dashboard", {
      acceptLanguage: "fr-FR,fr;q=0.9",
      cookie: `${APP_LOCALE_COOKIE_NAME}=retired`,
    });
    expect(staleApp.location).toBe("http://localhost:4000/fr/dashboard");

    const appOnlyContent = await call("/pricing", {
      acceptLanguage: "de-DE,de;q=0.9",
      cookie: `${CONTENT_LOCALE_COOKIE_NAME}=fr`,
    });
    expect(appOnlyContent.location).toBe("http://localhost:4000/de/pricing");
  });
});
