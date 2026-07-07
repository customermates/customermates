import type { Data, Validated } from "@/core/validation/validation.utils";

import type { MessagingService } from "../messaging.service";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";
import type { SocialPost } from "./social-posts.schema";

import { z } from "zod";
import { getLocale, getTranslations } from "next-intl/server";

import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { createZodError } from "@/core/validation/validation.utils";
import { isSocialProvider } from "../provider";
import { formatRetryAfter } from "../retry-after";
import { SocialPostSchema } from "./social-posts.schema";

export const GetSocialPostSchema = z.object({
  connectedAccountId: z.uuid(),
  postId: z.string().min(1),
});
type GetSocialPostData = Data<typeof GetSocialPostSchema>;

@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetSocialPostInteractor extends AuthenticatedInteractor<GetSocialPostData, SocialPost> {
  constructor(
    private accountRepo: FindUsableAccountRepo,
    private messagingService: MessagingService,
  ) {
    super();
  }

  @Validate(GetSocialPostSchema)
  @ValidateOutput(SocialPostSchema)
  async invoke(data: GetSocialPostData): Validated<SocialPost> {
    const account = await this.accountRepo.findUsableAccountByIdOrThrow(data.connectedAccountId);

    if (!isSocialProvider(account.provider)) {
      const t = await getTranslations();
      return {
        ok: false,
        error: createZodError<SocialPost>(
          t("Common.errors.socialPostsRequireSocialAccount", { provider: account.provider }),
        ),
      };
    }

    const res = await this.messagingService.getPost({
      accountId: account.unipileAccountId,
      postId: data.postId,
    });
    if (!res.ok) {
      const t = await getTranslations();
      return {
        ok: false,
        error: createZodError<SocialPost>(
          t(`Common.errors.${res.error}`, { retryAfter: formatRetryAfter(await getLocale(), res.retryAfterSeconds) }),
        ),
      };
    }

    return { ok: true as const, data: res.data };
  }
}
