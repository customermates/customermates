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
import { APP_LOCALE_COOKIE_NAME } from "./i18n/locale-preference";
import { appRouting, contentRouting, isContentPage, isPublicPage } from "./i18n/routing";
import { env } from "./env";
import { auth } from "./core/auth/better-auth";
import { resolveRequestOrigin } from "./core/config/environment";
import { SYNTHETIC_SEED_USER } from "./core/config/synthetic-seed-user";

const intlAppMiddleware = createMiddleware(appRouting);
const intlContentMiddleware = createMiddleware(contentRouting);

const LOCALE_SHAPED_SEGMENT = /^[a-z]{2}(?:-[a-z0-9]{2,8})*$/i;

function preferredAppLocale(req: NextRequest) {
  const value = req.cookies.get(APP_LOCALE_COOKIE_NAME)?.value;
  return isAppLocale(value) ? value : null;
}

function localeRedirect(locale: string, unprefixedPath: string, base: string | URL, search: string) {
  const target = new URL(buildLocalePath(locale, unprefixedPath), base);
  target.search = search;
  return NextResponse.redirect(target);
}

function negotiateLocale(req: NextRequest, base: string | URL, domain: "app" | "auto" = "auto") {
  const useContentLocale = domain === "auto" && isContentPage(req);

  if (!useContentLocale) {
    const preferredLocale = preferredAppLocale(req);
    if (preferredLocale) {
      const response = localeRedirect(preferredLocale, req.nextUrl.pathname, base, req.nextUrl.search);
      response.headers.set("vary", "accept-language, cookie");
      return response;
    }
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

const SESSION_COOKIE_NAMES = ["app.session_token=", "__Secure-app.session_token="] as const;

function hasSessionCookie(req: NextRequest): boolean {
  const cookieHeader = req.headers.get("cookie") ?? "";
  return SESSION_COOKIE_NAMES.some((name) => cookieHeader.includes(name));
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

  if (isApiRoute) return NextResponse.next();

  let session;
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

  const currentLocale = routingLocaleFromPathname(pathname);

  if (currentLocale === null) {
    if (isUnsupportedLocalePrefix(pathname)) return NextResponse.next();
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

  if (!isAuthenticated) {
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
       * - monitoring (Sentry tunnel route, must bypass i18n so the SDK can POST to /monitoring directly)
       * - .well-known (Vercel Workflow SDK + OAuth discovery routes, must bypass auth/i18n)
       * - _next/static, _next/image (Next.js internal)
       * - _vercel (Vercel internal routes)
       * - Files with extensions (images, scripts, etc.)
       * - favicon.ico, sitemap.xml, robots.txt (metadata files)
       *
       * Exclude prefetch requests:
       * - Requests with "next-router-prefetch" header
       * - Requests with "purpose: prefetch" header
       *
       */
      source:
        "/((?!og(?:/|$)|monitoring(?:/|$)|\\.well-known(?:/|$)|_next/static|_next/image|_vercel|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.[a-z0-9]+$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
