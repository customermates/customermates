import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";

import { ROUTING_DEFAULT_LOCALE, ROUTING_LOCALES, isPublicPage, routing } from "./i18n/routing";
import { env } from "./env";
import { auth } from "./core/auth/better-auth";
import { resolveRequestOrigin } from "./core/config/environment";
import { SYNTHETIC_SEED_USER } from "./core/config/synthetic-seed-user";
import {
  AFFILIATE_REFERRAL_COOKIE,
  AFFILIATE_REFERRAL_MAX_AGE_SECONDS,
  readAffiliateReferral,
} from "./core/affiliate/affiliate-referral";

const intlMiddlewareRaw = createMiddleware(routing);

function intlMiddleware(req: NextRequest) {
  const response = intlMiddlewareRaw(req);
  if (response.status !== 307) return response;
  const location = response.headers.get("location");
  if (!location) return response;
  const permanent = NextResponse.redirect(location, 308);
  for (const cookie of response.cookies.getAll()) permanent.cookies.set(cookie);
  return permanent;
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
  const response = await route(req);
  const referral = readAffiliateReferral(req.nextUrl);

  if (referral) {
    response.cookies.set(AFFILIATE_REFERRAL_COOKIE, referral, {
      maxAge: AFFILIATE_REFERRAL_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "lax",
    });
  }

  return response;
}

async function route(req: NextRequest) {
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

  const currentLocale = ROUTING_LOCALES.find(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );

  if (!currentLocale) return intlMiddleware(req);

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

  const isRootOrLocaleOnly = ROUTING_LOCALES.some((locale) => pathname === `/${locale}`);

  if (isAuthenticated && isRootOrLocaleOnly) return NextResponse.redirect(new URL(`${pathname}/dashboard`, base));

  if (isPublicPage(req)) return intlMiddleware(req);

  if (!isAuthenticated) {
    const redirectLocale = currentLocale !== undefined ? currentLocale : ROUTING_DEFAULT_LOCALE;
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
