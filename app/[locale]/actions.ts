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
import { serializeResult } from "@/core/utils/action-result";
import { unwrapValidated } from "@/core/validation/validation.utils";

export async function signOutAction() {
  return serializeResult(getSignOutInteractor().invoke());
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
