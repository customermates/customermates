import type { NextRequest } from "next/server";

import { describe, expect, it, vi } from "vitest";
import { NextRequest as NextRequestValue } from "next/server";

const mockEnv = vi.hoisted(() => ({
  APP_MODE: "self-hosted" as const,
  AUTH_ALLOWED_HOSTS: ["localhost:4000"],
  BASE_URL: "http://localhost:4000",
}));

vi.mock("@/i18n/locale-registry", () => {
  type Capabilities = {
    offeredAsDisplayLanguage: boolean;
    offeredAsFormattingLocale: boolean;
    hasPublishedContent: boolean;
    formattingTag: string;
    flagCode: string;
    validationTag: string;
    lowercaseEntityLabelsInSentences: boolean;
  };

  const registry: Record<string, Capabilities> = {
    en: {
      offeredAsDisplayLanguage: true,
      offeredAsFormattingLocale: true,
      hasPublishedContent: true,
      formattingTag: "en-US",
      flagCode: "us",
      validationTag: "en",
      lowercaseEntityLabelsInSentences: true,
    },
    de: {
      offeredAsDisplayLanguage: true,
      offeredAsFormattingLocale: true,
      hasPublishedContent: true,
      formattingTag: "de-DE",
      flagCode: "de",
      validationTag: "de",
      lowercaseEntityLabelsInSentences: false,
    },
    fr: {
      offeredAsDisplayLanguage: true,
      offeredAsFormattingLocale: true,
      hasPublishedContent: false,
      formattingTag: "fr-FR",
      flagCode: "fr",
      validationTag: "fr",
      lowercaseEntityLabelsInSentences: true,
    },
    nl: {
      offeredAsDisplayLanguage: false,
      offeredAsFormattingLocale: false,
      hasPublishedContent: true,
      formattingTag: "nl-NL",
      flagCode: "nl",
      validationTag: "nl",
      lowercaseEntityLabelsInSentences: true,
    },
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
    appLocaleFromLanguageTag: (value: string) => {
      const base = value.toLowerCase().split("-")[0];
      return ROUTING_LOCALES.find((locale) => isAppLocale(locale) && locale === base) ?? null;
    },
    formattingTagFor: (locale: string) => registry[locale].formattingTag,
    flagCodeFor: (locale: string) => registry[locale].flagCode,
    routingLocaleFromUrlSegment: (value: string) =>
      ROUTING_LOCALES.find((locale) => locale.toLowerCase() === value.toLowerCase()) ?? null,
    routingLocaleFromPathname: (pathname: string) => {
      const segment = pathname.split("/")[1];
      return ROUTING_LOCALES.find((locale) => locale.toLowerCase() === segment?.toLowerCase()) ?? null;
    },
    stripLocalePrefix: (pathname: string) => {
      const segment = pathname.split("/")[1];
      if (!isRoutingLocale(segment)) return pathname;
      const remainder = pathname.slice(segment.length + 1);
      return remainder === "" ? "/" : remainder;
    },
    buildLocalePath: (locale: string, routePath: string) =>
      routePath === "/" ? `/${locale}` : `/${locale}${routePath}`,
  };
});

vi.mock("@/env", () => ({ env: mockEnv }));

vi.mock("@/core/auth/better-auth", () => ({
  auth: {
    api: { getSession: vi.fn(), signInEmail: vi.fn(), signOut: vi.fn() },
  },
}));

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
import { appRouting, contentRouting, routing } from "@/i18n/routing";

function request(pathname: string, acceptLanguage?: string): NextRequest {
  return new NextRequestValue(`http://localhost:4000${pathname}`, {
    headers: acceptLanguage ? { "accept-language": acceptLanguage } : undefined,
  });
}

async function call(pathname: string, acceptLanguage?: string) {
  const response = await proxy(request(pathname, acceptLanguage));
  return {
    status: response.status,
    location: response.headers.get("location"),
    response,
  };
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

  it("routes application pages only through application locales", () => {
    expect([...appRouting.locales].sort()).toEqual(["de", "en", "fr"]);
    expect(appRouting.locales).not.toContain("nl");
  });

  it("leaves alternate-language headers to the html metadata", () => {
    expect(routing.alternateLinks).toBe(false);
    expect(contentRouting.alternateLinks).toBe(false);
  });
});

describe("proxy locale routing", () => {
  it("preserves hub queries while falling back to a published content locale", async () => {
    for (const query of ["page=1&utm_source=proof", "page=4", "page=2"]) {
      const fallback = await call(`/fr/blog?${query}`);
      expect(fallback.status, query).toBe(307);
      expect(fallback.location, query).toBe(`http://localhost:4000/en/blog?${query}`);
    }
  });

  it("never emits a permanently cached redirect", async () => {
    for (const path of PATHS) {
      const { status } = await call(path);
      expect(status, `${path} returned a permanent redirect`).not.toBe(308);
      expect(status, `${path} returned a permanent redirect`).not.toBe(301);
    }
  });

  it("404s an unsupported locale prefix instead of redirecting", async () => {
    for (const path of ["/es/pricing", "/zz", "/pt-br/pricing", "/en-US/pricing"]) {
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

  it("negotiates an unprefixed application path into any routing locale", async () => {
    const subscription = await call("/company/subscription", "fr-FR,fr;q=0.9");
    expect(subscription.status).toBe(307);
    expect(
      subscription.location,
      "an application page exists in every routing locale, so the reader keeps their own language",
    ).toContain("/fr/company/subscription");
    expect(subscription.response.headers.get("vary")).toBe("accept-language, cookie");

    const contact = await call("/contact", "fr-FR,fr;q=0.9");
    expect(contact.location, "a public page outside the content set is still an application page").toContain(
      "/fr/contact",
    );
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

  it("keeps protected routes reachable in every application locale", async () => {
    for (const locale of ["en", "de", "fr"]) {
      const { status, location } = await call(`/${locale}/dashboard`);
      expect(status, `/${locale}/dashboard should redirect an anonymous visitor to sign-in`).toBe(307);
      expect(location).toContain(`/${locale}/auth/signin`);
    }

    const contentOnly = await call("/nl/dashboard");
    expect(contentOnly.status).toBe(307);
    expect(contentOnly.location).toContain("/en/dashboard");
    expect(contentOnly.location).not.toContain("/nl/auth/signin");
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
