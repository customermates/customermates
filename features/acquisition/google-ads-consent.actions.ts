"use server";

import * as Sentry from "@sentry/nextjs";

import { getWithdrawGoogleAdsAttributionInteractor } from "@/core/di";
import { env } from "@/env";
import { readPublicGoogleAdsCookie, writePublicGoogleAdsCookie } from "./google-ads-consent.cookie";
import {
  PublicGoogleAdsConsentDecisionInputSchema,
  buildPublicGoogleAdsCookieDecision,
  normalizeGoogleAdsClick,
  type PublicGoogleAdsConsent,
} from "./google-ads-consent.schema";

export type PublicGoogleAdsConsentSummary = PublicGoogleAdsConsent;

export async function readPublicGoogleAdsConsentAction(): Promise<PublicGoogleAdsConsentSummary | null> {
  if (env.APP_MODE !== "cloud") return null;
  return (await readPublicGoogleAdsCookie())?.consent ?? null;
}

export async function reconcileGoogleAdsAttributionWithdrawalAction(): Promise<void> {
  if (env.APP_MODE !== "cloud") return;
  const existing = await readPublicGoogleAdsCookie();
  if (!existing || existing.consent.advertising) return;
  try {
    await getWithdrawGoogleAdsAttributionInteractor().invoke();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { kind: "google-ads-attribution-withdrawal" },
    });
  }
}

export async function captureConsentedGoogleAdsClickAction(input: unknown): Promise<void> {
  if (env.APP_MODE !== "cloud") return;
  const existing = await readPublicGoogleAdsCookie();
  if (!existing?.consent.advertising || existing.click) return;
  const click = normalizeGoogleAdsClick(input);
  if (!click) return;
  await writePublicGoogleAdsCookie({ ...existing, click });
}

export async function decidePublicGoogleAdsConsentAction(
  input: unknown,
): Promise<PublicGoogleAdsConsentSummary | null> {
  if (env.APP_MODE !== "cloud") return null;
  const parsed = PublicGoogleAdsConsentDecisionInputSchema.safeParse(input);
  if (!parsed.success) return (await readPublicGoogleAdsCookie())?.consent ?? null;

  const decision = buildPublicGoogleAdsCookieDecision({
    existing: await readPublicGoogleAdsCookie(),
    input: parsed.data,
    now: new Date(),
  });
  if (!(await writePublicGoogleAdsCookie(decision))) return null;
  return decision.consent;
}
