import type { Data, Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import type { MessagingService } from "../messaging.service";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";
import type { SocialPostList } from "./social-posts.schema";

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
import { SocialPostListSchema } from "./social-posts.schema";

export const ListSocialPostsSchema = z.object({
  connectedAccountId: z.uuid().describe("Connected LinkedIn or Instagram account ID"),
  authorIdentifier: z
    .string()
    .min(1)
    .default("me")
    .describe(
      "Person whose posts to list: 'me' or a top-level profile/participant id. Do not use LinkedIn public_identifier or specifics.member_id",
    ),
  cursor: z
    .string()
    .min(1)
    .optional()
    .describe("Cursor returned as next_cursor by the previous page. Omit cursor and offset on the first request"),
  offset: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(
      "Offset for providers that support offset pagination. Omit cursor and offset on the first request; LinkedIn user posts use cursor pagination",
    ),
  limit: z.number().int().min(1).max(100).default(10).describe("Maximum posts to return (1-100, default 10)"),
});
type ListSocialPostsData = Data<typeof ListSocialPostsSchema>;

@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class ListSocialPostsInteractor extends AuthenticatedInteractor<ListSocialPostsData, SocialPostList> {
  constructor(
    private accountRepo: FindUsableAccountRepo,
    private messagingService: MessagingService,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(ListSocialPostsSchema)
  @ValidateOutput(SocialPostListSchema)
  async invoke(data: ListSocialPostsData): Validated<SocialPostList> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const account = await this.accountRepo.findUsableAccountByIdOrThrow(data.connectedAccountId);

    if (!isSocialProvider(account.provider)) {
      const t = await getTranslations();
      return {
        ok: false,
        error: createZodError<SocialPostList>(
          t("Common.errors.socialPostsRequireSocialAccount", { provider: account.provider }),
        ),
      };
    }

    const res = await this.messagingService.listUserPosts({
      accountId: account.unipileAccountId,
      userId: data.authorIdentifier,
      cursor: data.cursor,
      offset: data.offset,
      limit: data.limit,
    });
    if (!res.ok) {
      const t = await getTranslations();
      return {
        ok: false,
        error: createZodError<SocialPostList>(
          t(`Common.errors.${res.error}`, { retryAfter: formatRetryAfter(await getLocale(), res.retryAfterSeconds) }),
        ),
      };
    }

    return { ok: true as const, data: res.data };
  }
}
