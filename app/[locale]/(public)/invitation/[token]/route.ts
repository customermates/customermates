import { NextResponse } from "next/server";

import { getAuthService, getInviteTokenValidationInteractor } from "@/core/di";
import { env } from "@/env";

export async function GET(_request: Request, context: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await context.params;

  const base = env.BASE_URL;

  const session = await getAuthService().getSession();
  if (session) {
    const redirectPath = session.user?.emailVerified ? "dashboard" : "auth/verify-email";
    return NextResponse.redirect(new URL(`/${locale}/${redirectPath}`, base));
  }

  const inviteTokenResult = await getInviteTokenValidationInteractor().invoke({ token });
  const inviteToken = inviteTokenResult.data;

  if (!inviteToken.valid)
    return NextResponse.redirect(new URL(`/${locale}/auth/error?type=${inviteToken.errorMessage}`, base));

  const response = NextResponse.redirect(new URL(`/${locale}/auth/signup`, base));

  response.cookies.set("inviteToken", token, {
    httpOnly: true,
    secure: new URL(env.BASE_URL).protocol === "https:",
    path: "/",
  });

  return response;
}
