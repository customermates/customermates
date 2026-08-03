import type { NextRequest } from "next/server";

import { describe, expect, it, vi } from "vitest";
import { NextRequest as NextRequestValue } from "next/server";

const mockEnv = vi.hoisted(() => ({
  APP_MODE: "self-hosted" as const,
  AUTH_ALLOWED_HOSTS: ["localhost:4000"],
  BASE_URL: "http://localhost:4000",
}));

// A fixture registry with one application-only locale (fr) and one
// content-only locale (nl), so the route matrix can be exercised without
// shipping a third language. next-intl's real middleware runs against it.
vi.mock("@/i18n/locale-registry", () => {
  type Capabilities = {
    offeredAsDisplayLanguage: boolean;
    hasPublishedContent: boolean;
    formattingTag: string;
    flagCode: string;
  };

  const registry: Record<string, Capabilities> = {
    en: { offeredAsDisplayLanguage: true, hasPublishedContent: true, formattingTag: "en-US", flagCode: "us" },
    de: { offeredAsDisplayLanguage: true, hasPublishedContent: true, formattingTag: "de-DE", flagCode: "de" },
    fr: { offeredAsDisplayLanguage: true, hasPublishedContent: false, formattingTag: "fr-FR", flagCode: "fr" },
    nl: { offeredAsDisplayLanguage: false, hasPublishedContent: true, formattingTag: "nl-NL", flagCode: "nl" },
  };

  const isRoutingLocale = (value: unknown): value is string =>
    typeof value === "string" && Object.prototype.hasOwnProperty.call(registry, value);
  const isAppLocale = (value: unknown) => isRoutingLocale(value) && registry[value].offeredAsDisplayLanguage;
  const isContentLocale = (value: unknown) => isRoutingLocale(value) && registry[value].hasPublishedContent;
  const ROUTING_LOCALES = Object.keys(registry);

  return {
    LOCALE_REGISTRY: registry,
    ROUTING_LOCALES,
    APP_LOCALES: ROUTING_LOCALES.filter(isAppLocale),
    CONTENT_LOCALES: ROUTING_LOCALES.filter(isContentLocale),
    DEFAULT_LOCALE: "en",
    isRoutingLocale,
    isAppLocale,
    isContentLocale,
    appLocaleOrDefault: (value: unknown) => (isAppLocale(value) ? value : "en"),
    contentLocaleOrDefault: (value: unknown) => (isContentLocale(value) ? value : "en"),
    formattingTagFor: (locale: string) => registry[locale].formattingTag,
    flagCodeFor: (locale: string) => registry[locale].flagCode,
    routingLocaleFromPathname: (pathname: string) => {
      const segment = pathname.split("/")[1];
      return isRoutingLocale(segment) ? segment : null;
    },
    stripLocalePrefix: (pathname: string) => {
      const segment = pathname.split("/")[1];
      if (!isRoutingLocale(segment)) return pathname;
      const remainder = pathname.slice(segment.length + 1);
      return remainder === "" ? "/" : remainder;
    },
  };
});

vi.mock("@/env", () => ({ env: mockEnv }));

vi.mock("@/core/auth/better-auth", () => ({
  auth: { api: { getSession: vi.fn(), signInEmail: vi.fn(), signOut: vi.fn() } },
}));

// next-intl's ESM build imports "next/server" extensionless, which Node rejects
// outside a bundler. This stand-in reproduces the two behaviours the proxy
// depends on: an unprefixed path is negotiated against the config's own locale
// list, and a prefixed path passes through. The locale lists themselves come
// from the real defineRouting call, so scoping is still what is under test.
vi.mock("next-intl/middleware", async () => {
  const { NextResponse } = await import("next/server");

  return {
    default: (config: { locales: readonly string[]; defaultLocale: string }) => (incoming: NextRequest) => {
      const { pathname } = incoming.nextUrl;
      const firstSegment = pathname.split("/")[1] ?? "";

      if (config.locales.includes(firstSegment)) return NextResponse.next();

      const caseMatch = config.locales.find((locale) => locale.toLowerCase() === firstSegment.toLowerCase());
      if (caseMatch) {
        const normalised = `/${caseMatch}${pathname.slice(firstSegment.length + 1)}`;
        return NextResponse.redirect(new URL(normalised, incoming.nextUrl.origin), 307);
      }

      const accepted = (incoming.headers.get("accept-language") ?? "")
        .split(",")
        .map((entry) => entry.split(";")[0].trim().toLowerCase().split("-")[0])
        .filter(Boolean);
      const negotiated = accepted.find((tag) => config.locales.includes(tag)) ?? config.defaultLocale;

      return NextResponse.redirect(new URL(`/${negotiated}${pathname}`, incoming.nextUrl.origin), 307);
    },
  };
});

import proxy from "@/proxy";
import { contentRouting, routing } from "@/i18n/routing";

function request(pathname: string, acceptLanguage?: string): NextRequest {
  return new NextRequestValue(`http://localhost:4000${pathname}`, {
    headers: acceptLanguage ? { "accept-language": acceptLanguage } : undefined,
  });
}

async function call(pathname: string, acceptLanguage?: string) {
  const response = await proxy(request(pathname, acceptLanguage));
  return { status: response.status, location: response.headers.get("location"), response };
}

const PATHS = [
  "/",
  "/pricing",
  "/en",
  "/de",
  "/fr",
  "/nl",
  "/en/pricing",
  "/fr/pricing",
  "/nl/pricing",
  "/en/dashboard",
  "/fr/dashboard",
  "/nl/dashboard",
  "/es/pricing",
  "/zz",
  "/EN/blog",
  "/en/auth/signin",
  "/fr/auth/signin",
];

describe("locale routing configuration", () => {
  it("recognises every routing locale as a url prefix", () => {
    expect([...routing.locales].sort()).toEqual(["de", "en", "fr", "nl"]);
  });

  it("negotiates only into locales that have published content", () => {
    expect([...contentRouting.locales].sort()).toEqual(["de", "en", "nl"]);
    expect(
      contentRouting.locales,
      "an application-only locale must not be reachable by content negotiation",
    ).not.toContain("fr");
  });

  it("leaves alternate-language headers to the html metadata", () => {
    expect(routing.alternateLinks).toBe(false);
    expect(contentRouting.alternateLinks).toBe(false);
  });
});

describe("proxy locale routing", () => {
  it("never emits a permanently cached redirect", async () => {
    for (const path of PATHS) {
      const { status } = await call(path);
      expect(status, `${path} returned a permanent redirect`).not.toBe(308);
      expect(status, `${path} returned a permanent redirect`).not.toBe(301);
    }
  });

  it("404s an unsupported locale prefix instead of redirecting", async () => {
    for (const path of ["/es/pricing", "/zz", "/pt-br/pricing"]) {
      const { status, location } = await call(path);
      expect(location, `${path} must not redirect into a URL we may later serve`).toBeNull();
      expect(status, `${path} should fall through to the app router`).toBe(200);
    }
  });

  it("negotiates an unprefixed path into a content locale only", async () => {
    const german = await call("/pricing", "de-DE,de;q=0.9");
    expect(german.status).toBe(307);
    expect(german.location).toContain("/de/pricing");
    expect(german.response.headers.get("vary")).toBe("accept-language, cookie");

    const french = await call("/pricing", "fr-FR,fr;q=0.9");
    expect(french.status).toBe(307);
    expect(french.location, "an application-only locale must never be an auto-detect target").toContain("/en/pricing");

    const dutch = await call("/pricing", "nl-NL,nl;q=0.9");
    expect(dutch.location, "a content locale remains negotiable").toContain("/nl/pricing");
  });

  it("normalises a mixed-case prefix of a known locale", async () => {
    const { status, location } = await call("/EN/blog");
    expect(status).toBe(307);
    expect(location).toContain("/en/blog");
  });

  it("sends an application-only locale root to the default locale homepage", async () => {
    const { status, location } = await call("/fr");
    expect(status).toBe(307);
    expect(location).toContain("/en");
    expect(location).not.toContain("/fr");
  });

  it("serves the locale root of a content locale", async () => {
    for (const path of ["/en", "/de", "/nl"]) {
      const { status, location } = await call(path);
      expect(location, `${path} should render, not redirect`).toBeNull();
      expect(status).toBe(200);
    }
  });

  it("keeps protected routes reachable in every routing locale", async () => {
    for (const locale of ["en", "de", "fr", "nl"]) {
      const { status, location } = await call(`/${locale}/dashboard`);
      expect(status, `/${locale}/dashboard should redirect an anonymous visitor to sign-in`).toBe(307);
      expect(location).toContain(`/${locale}/auth/signin`);
    }
  });

  it("terminates within a bounded number of hops", async () => {
    for (const path of PATHS) {
      let current = path;

      for (let hop = 0; hop < 5; hop += 1) {
        const { status, location } = await call(current);
        if (status < 300 || status >= 400 || !location) break;
        const next = new URL(location, "http://localhost:4000").pathname;
        expect(next, `${path} redirects to itself`).not.toBe(current);
        current = next;
        expect(hop, `${path} did not settle within 5 hops`).toBeLessThan(4);
      }
    }
  });
});
