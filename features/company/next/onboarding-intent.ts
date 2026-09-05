import "server-only";

import { getOnboardingIntentService } from "@/core/di";

import { readInviteTokenCookie } from "./invite-token-cookie";

export function issueInvitationOnboardingIntent(token: string, inviteExpiresAt: Date, now = new Date()): string | null {
  return getOnboardingIntentService().issueInvitation(token, inviteExpiresAt, now);
}

export async function resolveOnboardingIntent(value?: string | string[]) {
  const legacyToken = value === undefined ? await readInviteTokenCookie() : undefined;
  return getOnboardingIntentService().resolve(value, legacyToken);
}
