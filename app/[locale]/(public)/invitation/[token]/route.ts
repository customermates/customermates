import { NextResponse } from "next/server";

import { getAuthService, getInviteTokenValidationInteractor } from "@/core/di";
import { resolveRequestOrigin } from "@/core/config/environment";
import { env } from "@/env";
import { pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";
import { issueInvitationOnboardingIntent } from "@/features/company/next/onboarding-intent";
import { INVITE_TOKEN_COOKIE_NAME } from "@/features/company/next/invite-token-cookie";

function redirectWithoutLegacyInvitation(url: URL): NextResponse {
  const response = NextResponse.redirect(url);
  response.cookies.delete(INVITE_TOKEN_COOKIE_NAME);
  return response;
}

export async function GET(request: Request, context: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await context.params;

  const base = resolveRequestOrigin(request.url, env.AUTH_ALLOWED_HOSTS, env.BASE_URL);

  const inviteTokenResult = await getInviteTokenValidationInteractor().invoke({ token });

  if (!inviteTokenResult.ok)
    return redirectWithoutLegacyInvitation(new URL(`/${locale}/auth/error?type=invalidInviteLink`, base));

  const inviteToken = inviteTokenResult.data;

  if (!inviteToken.valid)
    return redirectWithoutLegacyInvitation(new URL(`/${locale}/auth/error?type=${inviteToken.errorMessage}`, base));

  const session = await getAuthService().getSession();
  const destination = session ? "auth/invitation" : "auth/signup";
  const invitationIntent = issueInvitationOnboardingIntent(token, inviteToken.expiresAt);
  if (!invitationIntent)
    return redirectWithoutLegacyInvitation(new URL(`/${locale}/auth/error?type=inviteLinkExpired`, base));
  const response = redirectWithoutLegacyInvitation(
    new URL(pathWithOnboardingIntent(`/${locale}/${destination}`, invitationIntent), base),
  );

  return response;
}
