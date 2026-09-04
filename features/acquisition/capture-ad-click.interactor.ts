import type { AdAttributionCookieRepo } from "./ad-attribution.repo";
import type { PublicAdAttributionVisitInput } from "./ad-attribution.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { AD_ATTRIBUTION_NOTICE_VERSION } from "@/constants/legal-documents";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { env } from "@/env";
import { PublicAdAttributionVisitInputSchema } from "./ad-attribution.schema";
import { activeRetainedAdClicks, isConsentForNotice, mergeRetainedAdClicks } from "./ad-click-retention";
import { normalizePublicAdVisitClick } from "./ad-click-url";

@SystemInteractor
export class CaptureAdClickInteractor {
  constructor(private readonly cookieRepo: AdAttributionCookieRepo) {}

  @Validate(PublicAdAttributionVisitInputSchema)
  @ValidateOutput(z.boolean())
  async invoke(data: PublicAdAttributionVisitInput): Validated<boolean> {
    if (env.APP_MODE !== "cloud") return { ok: true as const, data: false };

    const existing = await this.cookieRepo.readCookie();
    if (!existing?.consent.advertising || !isConsentForNotice(existing.consent, AD_ATTRIBUTION_NOTICE_VERSION))
      return { ok: true as const, data: false };

    const now = new Date();
    const click = normalizePublicAdVisitClick(data, now);
    if (!click) return { ok: true as const, data: false };

    const retained = activeRetainedAdClicks(existing.clicks, now);
    const merged = mergeRetainedAdClicks(retained, click, now);
    if (!merged && retained.length === existing.clicks.length) return { ok: true as const, data: false };

    return { ok: true as const, data: await this.cookieRepo.writeCookie({ ...existing, clicks: merged ?? retained }) };
  }
}
