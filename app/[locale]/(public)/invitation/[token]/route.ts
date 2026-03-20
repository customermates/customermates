import { NextResponse } from "next/server";

import { di } from "@/core/dependency-injection/container";
import { AuthService } from "@/features/auth/auth.service";
import { InviteTokenValidationInteractor } from "@/features/company/invite-token-validation.interactor";
import { IS_PRODUCTION } from "@/constants/env";

export async function GET(request: Request, context: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await context.params;

  const session = await di.get(AuthService).getSession();
  if (session) {
    const redirectPath = session.user?.emailVerified ? "dashboard" : "auth/verify-email";
    return NextResponse.redirect(new URL(`/${locale}/${redirectPath}`, request.url));
  }

  const inviteToken = await di.get(InviteTokenValidationInteractor).invoke({ token });

  if (!inviteToken.valid)
    return NextResponse.redirect(new URL(`/${locale}/auth/error?type=${inviteToken.errorMessage}`, request.url));

  const response = NextResponse.redirect(new URL(`/${locale}/auth/signup`, request.url));

  response.cookies.set("inviteToken", token, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    path: "/",
  });

  return response;
}
