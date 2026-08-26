import type { Data, Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import type { MessagingService } from "../messaging.service";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";
import type { SocialProfile } from "./social-posts.schema";

import { z } from "zod";
import { getLocale, getTranslations } from "next-intl/server";

import { MessagingProvider, Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { createZodError } from "@/core/validation/validation.utils";
import { isSocialProvider } from "../provider";
import { formatRetryAfter } from "../retry-after";
import { SocialProfileSchema } from "./social-posts.schema";

export const GetSocialProfileSchema = z.object({
  connectedAccountId: z
    .uuid()
    .describe("LinkedIn or Instagram connected-account ID returned by GET /v1/messaging/connected-accounts"),
  identifier: z
    .string()
    .min(1)
    .describe(
      "Person: 'me', participants[].identifier from a messaging-thread response, a top-level person id returned by a social response, a LinkedIn Classic public profile slug, or an Instagram username. Company: an id returned by Sales Navigator company search or current_positions[].company_id, with profileType=company",
    ),
  profileType: z
    .enum(["person", "company"])
    .default("person")
    .describe("Lookup route to use. Company lookup requires a connected LinkedIn account"),
});
type GetSocialProfileData = Data<typeof GetSocialProfileSchema>;

@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetSocialProfileInteractor extends AuthenticatedInteractor<GetSocialProfileData, SocialProfile> {
  constructor(
    private accountRepo: FindUsableAccountRepo,
    private messagingService: MessagingService,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(GetSocialProfileSchema)
  @ValidateOutput(SocialProfileSchema)
  async invoke(data: GetSocialProfileData): Validated<SocialProfile> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const account = await this.accountRepo.findUsableAccountByIdOrThrow(data.connectedAccountId);

    if (!isSocialProvider(account.provider)) {
      const t = await getTranslations();
      return {
        ok: false,
        error: createZodError<SocialProfile>(
          t("Common.errors.socialActionRequiresSocialAccount", { provider: account.provider }),
        ),
      };
    }

    if (data.profileType === "company" && account.provider !== MessagingProvider.linkedin) {
      const t = await getTranslations();
      return {
        ok: false,
        error: createZodError<SocialProfile>(t("Common.errors.linkedinProductRequiresLinkedin")),
      };
    }

    const res = await this.messagingService.getSocialProfile({
      accountId: account.unipileAccountId,
      identifier: data.identifier,
      profileType: data.profileType,
    });
    if (!res.ok) {
      const t = await getTranslations();
      return {
        ok: false,
        error: createZodError<SocialProfile>(
          t(`Common.errors.${res.error}`, { retryAfter: formatRetryAfter(await getLocale(), res.retryAfterSeconds) }),
        ),
      };
    }

    return { ok: true as const, data: res.data };
  }
}
