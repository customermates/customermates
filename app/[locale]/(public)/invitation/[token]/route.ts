import { NextResponse } from "next/server";

import { getAuthService, getInviteTokenValidationInteractor } from "@/core/app-di";
import { env } from "@/env";

export async function GET(request: Request, context: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await context.params;

  const session = await getAuthService().getSession();
  if (session) {
    const redirectPath = session.user?.emailVerified ? "dashboard" : "auth/verify-email";
    return NextResponse.redirect(new URL(`/${locale}/${redirectPath}`, request.url));
  }

  const inviteTokenResult = await getInviteTokenValidationInteractor().invoke({ token });
  const inviteToken = inviteTokenResult.data;

  if (!inviteToken.valid)
    return NextResponse.redirect(new URL(`/${locale}/auth/error?type=${inviteToken.errorMessage}`, request.url));

  const response = NextResponse.redirect(new URL(`/${locale}/auth/signup`, request.url));

  response.cookies.set("inviteToken", token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    path: "/",
  });

  return response;
}
