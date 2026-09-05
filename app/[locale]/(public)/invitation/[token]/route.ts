import { NextResponse } from "next/server";

import { getOpenInvitationInteractor } from "@/core/di";
import { resolveRequestOrigin } from "@/core/config/environment";
import { env } from "@/env";
import { INVITE_TOKEN_COOKIE_NAME } from "@/features/company/next/invite-token-cookie";
import { buildLocalePath } from "@/i18n/locale-registry";

export async function GET(request: Request, context: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await context.params;

  const base = resolveRequestOrigin(request.url, env.AUTH_ALLOWED_HOSTS, env.BASE_URL);

  const result = await getOpenInvitationInteractor().invoke({ token });
  const response = NextResponse.redirect(new URL(buildLocalePath(locale, result.redirect), base));
  response.cookies.delete(INVITE_TOKEN_COOKIE_NAME);

  return response;
}
