import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";

import {
  DEFAULT_LOCALE,
  buildLocalePath,
  isAppLocale,
  isContentLocale,
  routingLocaleFromPathname,
  routingLocaleFromUrlSegment,
  stripLocalePrefix,
} from "./i18n/locale-registry";
import { APP_LOCALE_COOKIE_NAME, CONTENT_LOCALE_COOKIE_NAME } from "./i18n/locale-preference";
import { appRouting, contentRouting, isContentPage, isProtectedPage, isPublicPage } from "./i18n/routing";
import { env } from "./env";
import { auth } from "./core/auth/better-auth";
import { resolveRequestOrigin } from "./core/config/environment";
import { malformedRequestPathResponse } from "./core/api/request-path-error";
import { SYNTHETIC_SEED_USER } from "./core/config/synthetic-seed-user";
import { legacyHubPageRedirect } from "./core/seo/hub-pagination";
import { LANDING_HUBS } from "./core/seo/landing-hubs";
import { NOT_FOUND_PAGE_PATH, isMissingContentPage, type ContentSlugManifest } from "./core/seo/missing-content-page";
import contentSlugs from "./generated/content-slugs.json";
import { SESSION_HINT_COOKIE_NAME, expiredSessionHintCookie, sessionHintCookie } from "./features/auth/session-hint";

const intlAppMiddleware = createMiddleware(appRouting);
const intlContentMiddleware = createMiddleware(contentRouting);

const NEXT_INTL_LOCALE_HEADER = "X-NEXT-INTL-LOCALE";

const LOCALE_SHAPED_SEGMENT = /^[a-z]{2}(?:-[a-z0-9]{2,8})*$/i;

function preferredAppLocale(req: NextRequest) {
  const value = req.cookies.get(APP_LOCALE_COOKIE_NAME)?.value;
  return isAppLocale(value) ? value : null;
}

function preferredContentLocale(req: NextRequest) {
  const value = req.cookies.get(CONTENT_LOCALE_COOKIE_NAME)?.value;
  return isContentLocale(value) ? value : null;
}

function localeRedirect(locale: string, unprefixedPath: string, base: string | URL, search: string) {
  const target = new URL(buildLocalePath(locale, unprefixedPath), base);
  target.search = search;
  return NextResponse.redirect(target);
}

function isUnprefixedContentPath(req: NextRequest): boolean {
  const pathname = req.nextUrl.pathname;
  if (pathname === "/" || routingLocaleFromPathname(pathname) !== null) return false;
  return !isUnsupportedLocalePrefix(pathname) && isContentPage(req);
}

function defaultLocaleContentRedirect(req: NextRequest, base: string | URL) {
  const target = new URL(buildLocalePath(DEFAULT_LOCALE, req.nextUrl.pathname), base);
  target.search = req.nextUrl.search;
  return NextResponse.redirect(target, 308);
}

function negotiateLocale(req: NextRequest, base: string | URL, domain: "app" | "auto" = "auto") {
  const useContentLocale = domain === "auto" && isContentPage(req);

  const preferredLocale = useContentLocale ? preferredContentLocale(req) : preferredAppLocale(req);
  if (preferredLocale) {
    const response = localeRedirect(preferredLocale, req.nextUrl.pathname, base, req.nextUrl.search);
    response.headers.set("vary", "accept-language, cookie");
    return response;
  }

  const negotiateOverLocalesThatCanServeIt = useContentLocale ? intlContentMiddleware : intlAppMiddleware;
  const response = negotiateOverLocalesThatCanServeIt(req);
  if (response.headers.has("location")) response.headers.set("vary", "accept-language, cookie");
  return response;
}

function isUnsupportedLocalePrefix(pathname: string): boolean {
  const firstSegment = pathname.split("/")[1] ?? "";
  return LOCALE_SHAPED_SEGMENT.test(firstSegment) && routingLocaleFromUrlSegment(firstSegment) === null;
}

function hasNestedLocalePrefix(pathname: string): boolean {
  const secondSegment = pathname.split("/")[2] ?? "";
  return routingLocaleFromUrlSegment(secondSegment) !== null;
}

function hasSessionCookie(req: NextRequest): boolean {
  return (req.headers.get("cookie") ?? "").includes("app.session_token=");
}

// A cross-site iframe cannot store the SameSite=Lax session cookie the demo sign-in sets, so the
// redirect below arrives unauthenticated again and again. The marker bounds that to one attempt.
const DEMO_SIGN_IN_ATTEMPT_PARAM = "cm_demo_auth";

function isEmbeddedRequest(req: NextRequest): boolean {
  return req.headers.get("sec-fetch-dest") === "iframe";
}

function appendSetCookieHeaders(response: NextResponse, authResponse: Response): void {
  const headers = authResponse.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies = headers.getSetCookie?.();

  if (!setCookies) throw new Error("The runtime must support Headers.getSetCookie() for automatic demo authentication");

  for (const cookie of setCookies) response.headers.append("set-cookie", cookie);
}

function notFoundResponse(req: NextRequest, locale: string): NextResponse {
  const headers = new Headers(req.headers);
  headers.set(NEXT_INTL_LOCALE_HEADER, locale);

  return NextResponse.rewrite(new URL(buildLocalePath(locale, NOT_FOUND_PAGE_PATH), req.url), {
    request: { headers },
  });
}

function legacyHubPageResponse(req: NextRequest, locale: string, base: string | URL): NextResponse | null {
  const unprefixedPath = stripLocalePrefix(req.nextUrl.pathname).replace(/\/$/u, "") || "/";
  const hub = LANDING_HUBS.find(({ hubPath }) => hubPath === unprefixedPath);
  if (!hub) return null;

  const resolution = legacyHubPageRedirect(hub.hubPath, req.nextUrl.searchParams);
  if (!resolution) return null;

  if (resolution.kind === "not-found") return notFoundResponse(req, locale);

  return NextResponse.redirect(new URL(buildLocalePath(locale, resolution.href), base), 308);
}

function syncSessionHint(req: NextRequest, response: NextResponse, isAuthenticated: boolean): NextResponse {
  if (req.cookies.has(SESSION_HINT_COOKIE_NAME) === isAuthenticated) return response;

  const secure = req.nextUrl.protocol === "https:" ? "; Secure" : "";
  response.headers.append(
    "set-cookie",
    isAuthenticated ? `${sessionHintCookie()}${secure}` : `${expiredSessionHintCookie()}${secure}`,
  );

  return response;
}

export default async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const base = resolveRequestOrigin(req.nextUrl.origin, env.AUTH_ALLOWED_HOSTS, env.BASE_URL);

  const isApiRoute = pathname.startsWith("/api");

  if (pathname === "/api/auth/mcp/authorize") {
    const authorizeWithConsent = req.nextUrl.clone();
    authorizeWithConsent.searchParams.set("prompt", "consent");

    let hasValidSession = false;

    if (hasSessionCookie(req)) {
      try {
        const session = await auth.api.getSession({ headers: req.headers });
        hasValidSession = Boolean(session?.session && session.session.expiresAt.getTime() > Date.now());
      } catch {
        hasValidSession = false;
      }
    }

    if (!hasValidSession) {
      const signInUrl = new URL("/auth/signin", base);
      signInUrl.searchParams.set("callbackURL", authorizeWithConsent.pathname + authorizeWithConsent.search);
      return NextResponse.redirect(signInUrl);
    }

    if (req.nextUrl.searchParams.get("prompt") !== "consent") return NextResponse.redirect(authorizeWithConsent);
  }

  if (isApiRoute) return malformedRequestPathResponse(pathname) ?? NextResponse.next();

  if (isUnprefixedContentPath(req)) return defaultLocaleContentRedirect(req, base);

  let session: ProxySession;
  let isAuthenticated = false;

  if (hasSessionCookie(req)) {
    try {
      session = await auth.api.getSession({ headers: req.headers });
      const now = Date.now();
      const isSessionValid = session?.session && session.session.expiresAt.getTime() > now;
      isAuthenticated = Boolean(isSessionValid);
    } catch {
      isAuthenticated = false;
    }
  }

  return syncSessionHint(req, await routePageRequest(req, base, session, isAuthenticated), isAuthenticated);
}

type ProxySession = Awaited<ReturnType<typeof auth.api.getSession>> | undefined;

async function routePageRequest(
  req: NextRequest,
  base: string | URL,
  session: ProxySession,
  isAuthenticated: boolean,
): Promise<NextResponse> {
  const pathname = req.nextUrl.pathname;
  const currentLocale = routingLocaleFromPathname(pathname);

  if (currentLocale === null) {
    if (isUnsupportedLocalePrefix(pathname)) return notFoundResponse(req, DEFAULT_LOCALE);
    return negotiateLocale(req, base, isAuthenticated && pathname === "/" ? "app" : "auto");
  }

  if (hasNestedLocalePrefix(pathname))
    return isContentLocale(currentLocale) ? intlContentMiddleware(req) : intlAppMiddleware(req);

  const isLocaleRootPage = pathname === buildLocalePath(currentLocale, "/");

  // Public marketing pages on the demo host render without a session; minting one for every
  // crawler hit wrote an AuthSession row per request.
  if (env.APP_MODE === "demo" && (!isContentPage(req) || isLocaleRootPage)) {
    const isNonDemoUser = isAuthenticated && session?.user?.email !== SYNTHETIC_SEED_USER.email;
    const exhaustedEmbeddedAttempt = isEmbeddedRequest(req) && req.nextUrl.searchParams.has(DEMO_SIGN_IN_ATTEMPT_PARAM);

    if ((isNonDemoUser || !isAuthenticated) && !exhaustedEmbeddedAttempt) {
      const signOutResponse = isNonDemoUser ? await auth.api.signOut({ headers: req.headers, asResponse: true }) : null;
      const signInResponse = await auth.api.signInEmail({
        headers: req.headers,
        body: {
          email: SYNTHETIC_SEED_USER.email,
          password: SYNTHETIC_SEED_USER.password,
          rememberMe: true,
        },
        asResponse: true,
      });

      if (!signInResponse.ok) throw new Error("Automatic demo authentication failed");

      // Authentication changes the request's cookie state. Redirect once so the
      // protected route is rendered from a fresh request with the new session.
      const target = req.nextUrl.clone();
      if (isEmbeddedRequest(req)) target.searchParams.set(DEMO_SIGN_IN_ATTEMPT_PARAM, "1");

      const response = NextResponse.redirect(target);
      if (signOutResponse) appendSetCookieHeaders(response, signOutResponse);
      appendSetCookieHeaders(response, signInResponse);
      return response;
    }
  }

  if (isAuthenticated && isLocaleRootPage) {
    const preferredLocale = preferredAppLocale(req);
    const target = preferredLocale
      ? new URL(buildLocalePath(preferredLocale, "/dashboard"), base)
      : new URL("/dashboard", base);
    target.search = req.nextUrl.search;
    return NextResponse.redirect(target);
  }

  if (isContentPage(req)) {
    if (!isContentLocale(currentLocale))
      return localeRedirect(DEFAULT_LOCALE, stripLocalePrefix(pathname), base, req.nextUrl.search);

    const legacyHubPage = legacyHubPageResponse(req, currentLocale, base);
    if (legacyHubPage) return legacyHubPage;

    if (isMissingContentPage(stripLocalePrefix(pathname), currentLocale, contentSlugs as ContentSlugManifest))
      return notFoundResponse(req, currentLocale);

    return intlContentMiddleware(req);
  }

  if (!isAppLocale(currentLocale)) {
    const appLocale = preferredAppLocale(req) ?? DEFAULT_LOCALE;
    return localeRedirect(appLocale, stripLocalePrefix(pathname), base, req.nextUrl.search);
  }

  if (isPublicPage(req)) return intlAppMiddleware(req);

  const preferredLocale = preferredAppLocale(req);
  // The public demo uses one shared synthetic account. Its persisted preference
  // must never override the explicit locale requested by an embed URL.
  if (env.APP_MODE !== "demo" && isAuthenticated && preferredLocale && preferredLocale !== currentLocale)
    return localeRedirect(preferredLocale, stripLocalePrefix(pathname), base, req.nextUrl.search);

  if (!isAuthenticated && isProtectedPage(req)) {
    const signInPath = buildLocalePath(currentLocale, "/auth/signin");
    const signInUrl = new URL(signInPath, base);
    signInUrl.searchParams.set("callbackURL", new URL(req.nextUrl.pathname + req.nextUrl.search, base).toString());

    return NextResponse.redirect(signInUrl);
  }

  return intlAppMiddleware(req);
}

export const config = {
  matcher: [
    {
      /*
       * Exclude paths:
       * - og (Open Graph image route)
       * - .well-known (Vercel Workflow SDK + OAuth discovery routes, must bypass auth/i18n)
       * - _next/static, _next/image (Next.js internal)
       * - _vercel (Vercel internal routes)
       * - Files with extensions (images, scripts, etc.), except API paths such as attachment file names
       * - favicon.ico, sitemap.xml, robots.txt (metadata files)
       *
       * Exclude prefetch requests:
       * - Requests with "next-router-prefetch" header
       * - Requests with "purpose: prefetch" header
       *
       */
      source:
        "/((?!og(?:/|$)|\\.well-known(?:/|$)|_next/static|_next/image|_vercel|favicon\\.ico|sitemap\\.xml|robots\\.txt|(?!api/).*\\.[a-z0-9]+$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
