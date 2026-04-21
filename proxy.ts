import type { NextRequest } from "next/server";

import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";

import { ROUTING_DEFAULT_LOCALE, ROUTING_LOCALES, isPublicPage, routing } from "./i18n/routing";
import { IS_DEMO_MODE } from "./constants/env";
import { auth } from "./core/auth/better-auth";

const intlMiddleware = createMiddleware(routing);

function hasSessionCookie(req: NextRequest): boolean {
  const cookieHeader = req.headers.get("cookie") ?? "";
  return cookieHeader.includes("app.session_token=");
}

export default async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  const isApiRoute = pathname.startsWith("/api");

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

  if (IS_DEMO_MODE) {
    const isNonDemoUser = isAuthenticated && session?.user?.email !== process.env.DEMO_USER_EMAIL;

    if (isNonDemoUser) await auth.api.signOut({ headers: req.headers });

    if (isNonDemoUser || !isAuthenticated) {
      await auth.api.signInEmail({
        headers: req.headers,
        body: {
          email: process.env.DEMO_USER_EMAIL as string,
          password: process.env.DEMO_USER_PASSWORD as string,
          rememberMe: true,
        },
      });

      isAuthenticated = true;
    }
  }

  const isRootOrLocaleOnly = ROUTING_LOCALES.some((locale) => pathname === `/${locale}`);

  if (isAuthenticated && isRootOrLocaleOnly) return NextResponse.redirect(new URL(`${pathname}/dashboard`, req.url));

  if (isPublicPage(req)) return intlMiddleware(req);

  if (!isAuthenticated) {
    const redirectLocale = currentLocale !== undefined ? currentLocale : ROUTING_DEFAULT_LOCALE;
    const signInPath = `/${redirectLocale}/auth/signin`;
    const signInUrl = new URL(signInPath, req.url);
    signInUrl.searchParams.set("callbackURL", req.url);

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
        "/((?!og(?:/|$)|_next/static|_next/image|_vercel|favicon\\.ico|sitemap\\.xml|robots\\.txt|.*\\.[a-z0-9]+$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
