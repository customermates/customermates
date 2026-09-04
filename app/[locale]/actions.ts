"use server";

import type {
  PublicAdAttributionDecisionData,
  PublicAdAttributionVisitInput,
} from "@/features/acquisition/ad-attribution.schema";

import {
  getCaptureAdClickInteractor,
  getDecideAdAttributionConsentInteractor,
  getReadAdAttributionConsentInteractor,
  getSignOutInteractor,
  getWithdrawAdAttributionInteractor,
} from "@/core/di";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { serializeResult } from "@/core/utils/action-result";
import { unwrapValidated } from "@/core/validation/validation.utils";
import { pathWithOnboardingIntent } from "@/features/company/onboarding-intent-url";
import { resolveOnboardingIntent } from "@/features/company/next/onboarding-intent";
import { clearInviteTokenCookie } from "@/features/company/next/invite-token-cookie";
import { buildLocalePath } from "@/i18n/locale-registry";

export async function signOutAction() {
  await clearInviteTokenCookie();
  return serializeResult(getSignOutInteractor().invoke());
}

export async function signOutForInvitationAction(invitationIntent: string) {
  const invitation = await resolveOnboardingIntent(invitationIntent);
  await clearInviteTokenCookie();
  await getSignOutInteractor().invoke();

  const locale = await getLocale();
  if (invitation.status !== "valid" || invitation.type !== "invitation") {
    const errorMessage = invitation.status === "invalid" ? invitation.errorMessage : "invalidOnboardingIntent";
    return redirect(buildLocalePath(locale, `/auth/error?type=${errorMessage}`));
  }

  return redirect(buildLocalePath(locale, pathWithOnboardingIntent("/auth/signup", invitation.intent)));
}

export async function readAdAttributionConsentAction() {
  return unwrapValidated(getReadAdAttributionConsentInteractor().invoke());
}

export async function decideAdAttributionConsentAction(data: PublicAdAttributionDecisionData) {
  return serializeResult(getDecideAdAttributionConsentInteractor().invoke(data));
}

export async function captureAdClickAction(data: PublicAdAttributionVisitInput) {
  return serializeResult(getCaptureAdClickInteractor().invoke(data));
}

export async function reconcileAdAttributionWithdrawalAction() {
  return serializeResult(getWithdrawAdAttributionInteractor().invoke());
}
