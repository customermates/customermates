import "server-only";

import { getOnboardingIntentService } from "@/core/di";

import { readInviteTokenCookie } from "./invite-token-cookie";

export async function resolveOnboardingIntent(value?: string | string[]) {
  const legacyToken = value === undefined ? await readInviteTokenCookie() : undefined;
  return getOnboardingIntentService().resolve(value, legacyToken);
}
