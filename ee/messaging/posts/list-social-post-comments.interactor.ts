import { CustomErrorCode } from "@/core/validation/validation.types";
import { fail } from "@/core/validation/interactor-failure-server";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import type { MessagingService } from "../messaging.service";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";
import type { SocialCommentList } from "./social-posts.schema";

import { z } from "zod";
import { getLocale } from "next-intl/server";

import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { isSocialProvider } from "../provider";
import { formatRetryAfter } from "../retry-after";
import { SocialCommentListSchema } from "./social-posts.schema";

export const ListSocialPostCommentsSchema = z.object({
  connectedAccountId: z.uuid(),
  postId: z.string().min(1),
  sortBy: z.enum(["MOST_RECENT", "MOST_RELEVANT"]).optional(),
  cursor: z.string().min(1).optional(),
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(100).default(10),
});
type ListSocialPostCommentsData = Data<typeof ListSocialPostCommentsSchema>;

@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class ListSocialPostCommentsInteractor extends AuthenticatedInteractor<
  ListSocialPostCommentsData,
  SocialCommentList
> {
  constructor(
    private accountRepo: FindUsableAccountRepo,
    private messagingService: MessagingService,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(ListSocialPostCommentsSchema)
  @ValidateOutput(SocialCommentListSchema)
  async invoke(data: ListSocialPostCommentsData): Validated<SocialCommentList> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const account = await this.accountRepo.findUsableAccountByIdOrThrow(data.connectedAccountId);

    if (!isSocialProvider(account.provider))
      return fail(CustomErrorCode.socialPostsRequireSocialAccount, [], { provider: account.provider });

    const res = await this.messagingService.listPostComments({
      accountId: account.unipileAccountId,
      postId: data.postId,
      sortBy: data.sortBy,
      cursor: data.cursor,
      offset: data.offset,
      limit: data.limit,
    });
    if (!res.ok) return fail(res.error, [], { retryAfter: formatRetryAfter(await getLocale(), res.retryAfterSeconds) });

    return { ok: true as const, data: res.data };
  }
}
