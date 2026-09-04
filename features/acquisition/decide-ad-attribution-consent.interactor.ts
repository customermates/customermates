import type { AdAttributionCookieRepo } from "./ad-attribution.repo";
import type {
  PublicAdAttributionConsent,
  PublicAdAttributionCookie,
  PublicAdAttributionDecisionData,
} from "./ad-attribution.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { AD_ATTRIBUTION_NOTICE_VERSION } from "@/constants/legal-documents";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { env } from "@/env";
import {
  PUBLIC_AD_ATTRIBUTION_COOKIE_MAX_AGE_SECONDS,
  PublicAdAttributionConsentSchema,
  PublicAdAttributionCookieSchema,
  PublicAdAttributionDecisionInputSchema,
} from "./ad-attribution.schema";
import { activeRetainedAdClicks, isConsentForNotice, mergeRetainedAdClicks } from "./ad-click-retention";
import { normalizePublicAdVisitClick } from "./ad-click-url";

export function buildPublicAdAttributionCookieDecision(args: {
  existing: PublicAdAttributionCookie | null;
  input: PublicAdAttributionDecisionData;
  noticeVersion: string;
  now: Date;
}): PublicAdAttributionCookie {
  const advertising = args.input.choice === "allow-attribution";
  const existingAllowed =
    args.existing?.consent.advertising === true && isConsentForNotice(args.existing.consent, args.noticeVersion)
      ? args.existing
      : null;
  const consent =
    advertising && existingAllowed
      ? existingAllowed.consent
      : { advertising, decidedAt: args.now.toISOString(), noticeVersion: args.noticeVersion };
  const expiresAt =
    advertising && existingAllowed
      ? existingAllowed.expiresAt
      : new Date(args.now.getTime() + PUBLIC_AD_ATTRIBUTION_COOKIE_MAX_AGE_SECONDS * 1000).toISOString();

  const visitClick = args.input.visit ? normalizePublicAdVisitClick(args.input.visit, args.now) : null;
  const retained = advertising ? activeRetainedAdClicks(existingAllowed?.clicks ?? [], args.now) : [];
  const merged = advertising && visitClick ? mergeRetainedAdClicks(retained, visitClick, args.now) : null;
  const clicks = merged ?? retained;

  return PublicAdAttributionCookieSchema.parse({ version: 1, consent, clicks, expiresAt });
}

@SystemInteractor
export class DecideAdAttributionConsentInteractor {
  constructor(private readonly cookieRepo: AdAttributionCookieRepo) {}

  @Validate(PublicAdAttributionDecisionInputSchema)
  @ValidateOutput(PublicAdAttributionConsentSchema.nullable())
  async invoke(data: PublicAdAttributionDecisionData): Validated<PublicAdAttributionConsent | null> {
    if (env.APP_MODE !== "cloud") return { ok: true as const, data: null };

    const decision = buildPublicAdAttributionCookieDecision({
      existing: await this.cookieRepo.readCookie(),
      input: data,
      noticeVersion: AD_ATTRIBUTION_NOTICE_VERSION,
      now: new Date(),
    });
    if (!(await this.cookieRepo.writeCookie(decision))) return { ok: true as const, data: null };

    return { ok: true as const, data: decision.consent };
  }
}
