"use server";

import type {
  PublicAdAttributionDecisionData,
  PublicAdAttributionVisitInput,
} from "@/features/acquisition/ad-attribution.schema";
import type { MarketingAccount } from "@/features/auth/account-state";

import {
  getCaptureAdClickInteractor,
  getDecideAdAttributionConsentInteractor,
  getReadAdAttributionConsentInteractor,
  getRouteGuardService,
  getSignOutInteractor,
  getWithdrawAdAttributionInteractor,
} from "@/core/di";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { serializeResult } from "@/core/utils/action-result";
import { unwrapValidated } from "@/core/validation/validation.utils";
import { buildLocalePath } from "@/i18n/locale-registry";

export async function readMarketingAccountAction(): Promise<MarketingAccount> {
  const { state, sessionUser, user } = await getRouteGuardService().resolveAccountState();
  if (state === "unauthenticated" || !sessionUser) return { profile: null, state };

  const name = user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() : (sessionUser.name ?? "").trim();
  return {
    profile: {
      avatarUrl: user?.avatarUrl ?? sessionUser.image ?? null,
      email: user?.email ?? sessionUser.email,
      name,
    },
    state,
  };
}

export async function signOutAction() {
  return serializeResult(getSignOutInteractor().invoke());
}

export async function signOutWithOnboardingIntentAction(onboardingIntent: string) {
  const result = await getSignOutInteractor().invoke({ onboardingIntent });
  return redirect(buildLocalePath(await getLocale(), result.redirect));
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
