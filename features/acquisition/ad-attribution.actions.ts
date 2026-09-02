"use server";

import * as Sentry from "@sentry/nextjs";

import { AD_ATTRIBUTION_NOTICE_VERSION } from "@/constants/legal-documents";
import { getWithdrawAdAttributionInteractor } from "@/core/di";
import { env } from "@/env";
import { readPublicAdAttributionCookie, writePublicAdAttributionCookie } from "./ad-attribution.cookie";
import {
  PublicAdAttributionDecisionInputSchema,
  activeRetainedAdClicks,
  buildPublicAdAttributionCookieDecision,
  isConsentForNotice,
  mergeRetainedAdClicks,
  normalizePublicAdVisitClick,
  type PublicAdAttributionConsent,
} from "./ad-attribution.schema";

export type PublicAdAttributionConsentSummary = PublicAdAttributionConsent;

export async function readPublicAdAttributionConsentAction(): Promise<PublicAdAttributionConsentSummary | null> {
  if (env.APP_MODE !== "cloud") return null;
  const consent = (await readPublicAdAttributionCookie())?.consent;
  if (!consent || !isConsentForNotice(consent, AD_ATTRIBUTION_NOTICE_VERSION)) return null;
  return consent;
}

export async function reconcileAdAttributionWithdrawalAction(): Promise<void> {
  if (env.APP_MODE !== "cloud") return;
  const existing = await readPublicAdAttributionCookie();
  if (!existing || existing.consent.advertising) return;
  try {
    await getWithdrawAdAttributionInteractor().invoke();
  } catch (error) {
    Sentry.captureException(error, {
      tags: { kind: "ad-attribution-withdrawal" },
    });
  }
}

export async function captureConsentedAdClickAction(input: unknown): Promise<void> {
  if (env.APP_MODE !== "cloud") return;
  const existing = await readPublicAdAttributionCookie();
  if (!existing?.consent.advertising || !isConsentForNotice(existing.consent, AD_ATTRIBUTION_NOTICE_VERSION)) return;
  const now = new Date();
  const click = normalizePublicAdVisitClick(input, now);
  if (!click) return;

  const retained = activeRetainedAdClicks(existing.clicks, now);
  const merged = mergeRetainedAdClicks(retained, click, now);
  if (!merged && retained.length === existing.clicks.length) return;

  await writePublicAdAttributionCookie({ ...existing, clicks: merged ?? retained });
}

export async function decidePublicAdAttributionConsentAction(
  input: unknown,
): Promise<PublicAdAttributionConsentSummary | null> {
  if (env.APP_MODE !== "cloud") return null;
  const parsed = PublicAdAttributionDecisionInputSchema.safeParse(input);
  if (!parsed.success) return readPublicAdAttributionConsentAction();

  const decision = buildPublicAdAttributionCookieDecision({
    existing: await readPublicAdAttributionCookie(),
    input: parsed.data,
    noticeVersion: AD_ATTRIBUTION_NOTICE_VERSION,
    now: new Date(),
  });
  if (!(await writePublicAdAttributionCookie(decision))) return null;
  return decision.consent;
}
