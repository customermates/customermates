import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";

import {
  DEFAULT_LOCALE,
  isContentLocale,
  isRoutingLocale,
  routingLocaleFromPathname,
  stripLocalePrefix,
} from "./i18n/locale-registry";
import { contentRouting, isContentPage, isPublicPage, routing } from "./i18n/routing";
import { env } from "./env";
import { auth } from "./core/auth/better-auth";
import { resolveRequestOrigin } from "./core/config/environment";
import { SYNTHETIC_SEED_USER } from "./core/config/synthetic-seed-user";

const intlMiddleware = createMiddleware(routing);
const intlNegotiatingMiddleware = createMiddleware(contentRouting);

const LOCALE_SHAPED_SEGMENT = /^[a-z]{2}(?:-[a-z0-9]{2,8})*$/i;

function negotiateLocale(req: NextRequest) {
  const response = intlNegotiatingMiddleware(req);
  if (response.headers.has("location")) response.headers.set("vary", "accept-language, cookie");
  return response;
}

// A locale-shaped prefix we do not serve must 404 rather than redirect: a redirect
// would be cached against a URL we may later want to serve for real.
function isUnsupportedLocalePrefix(pathname: string): boolean {
  const firstSegment = pathname.split("/")[1] ?? "";
  return LOCALE_SHAPED_SEGMENT.test(firstSegment) && !isRoutingLocale(firstSegment.toLowerCase());
}

function hasSessionCookie(req: NextRequest): boolean {
  const cookieHeader = req.headers.get("cookie") ?? "";
  return cookieHeader.includes("app.session_token=");
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

  const currentLocale = routingLocaleFromPathname(pathname);

  if (currentLocale === null) {
    if (isUnsupportedLocalePrefix(pathname)) return NextResponse.next();
    return negotiateLocale(req);
  }

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

  if (env.APP_MODE === "demo") {
    const isNonDemoUser = isAuthenticated && session?.user?.email !== SYNTHETIC_SEED_USER.email;

    if (isNonDemoUser || !isAuthenticated) {
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
      const response = NextResponse.redirect(req.nextUrl);
      if (signOutResponse) appendSetCookieHeaders(response, signOutResponse);
      appendSetCookieHeaders(response, signInResponse);
      return response;
    }
  }

  const isLocaleRootPage = pathname === `/${currentLocale}`;

  if (isAuthenticated && isLocaleRootPage) return NextResponse.redirect(new URL(`${pathname}/dashboard`, base));

  // An application-only locale publishes no marketing, blog or docs pages. Send
  // those URLs to the default locale instead of rendering an untranslated page.
  // Temporary, because whether a locale has content is a configuration value.
  if (!isContentLocale(currentLocale) && isContentPage(req)) {
    const unprefixed = stripLocalePrefix(pathname);
    const target = new URL(unprefixed === "/" ? `/${DEFAULT_LOCALE}` : `/${DEFAULT_LOCALE}${unprefixed}`, base);
    target.search = req.nextUrl.search;
    return NextResponse.redirect(target);
  }

  if (isPublicPage(req)) return intlMiddleware(req);

  if (!isAuthenticated) {
    const redirectLocale = currentLocale ?? DEFAULT_LOCALE;
    const signInPath = `/${redirectLocale}/auth/signin`;
    const signInUrl = new URL(signInPath, base);
    signInUrl.searchParams.set("callbackURL", new URL(req.nextUrl.pathname + req.nextUrl.search, base).toString());

    return NextResponse.redirect(signInUrl);
  }

  return intlMiddleware(req);
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
       * Only requests that match the source pattern AND don't have prefetch headers will run middleware
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
