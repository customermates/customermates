import type { AdAttributionCookieRepo } from "./ad-attribution.repo";
import type { PublicAdAttributionConsent } from "./ad-attribution.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { AD_ATTRIBUTION_NOTICE_VERSION } from "@/constants/legal-documents";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { env } from "@/env";
import { PublicAdAttributionConsentSchema } from "./ad-attribution.schema";
import { isConsentForNotice } from "./ad-click-retention";

@SystemInteractor
export class ReadAdAttributionConsentInteractor {
  constructor(private readonly cookieRepo: AdAttributionCookieRepo) {}

  @ValidateOutput(PublicAdAttributionConsentSchema.nullable())
  async invoke(): Validated<PublicAdAttributionConsent | null> {
    if (env.APP_MODE !== "cloud") return { ok: true as const, data: null };

    const consent = (await this.cookieRepo.readCookie())?.consent;
    if (!consent || !isConsentForNotice(consent, AD_ATTRIBUTION_NOTICE_VERSION))
      return { ok: true as const, data: null };

    return { ok: true as const, data: consent };
  }
}
