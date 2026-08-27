import { CustomErrorCode } from "@/core/validation/validation.types";
import { fail } from "@/core/validation/interactor-failure-server";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import type { MessagingService } from "../messaging.service";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";
import type { SocialReactionList } from "./social-posts.schema";

import { z } from "zod";
import { getLocale } from "next-intl/server";

import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { isSocialProvider } from "../provider";
import { formatRetryAfter } from "../retry-after";
import { SocialReactionListSchema } from "./social-posts.schema";

export const ListSocialCommentReactionsSchema = z.object({
  connectedAccountId: z.uuid(),
  postId: z.string().min(1),
  commentId: z.string().min(1),
  cursor: z.string().min(1).optional(),
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(100).default(10),
});
type ListSocialCommentReactionsData = Data<typeof ListSocialCommentReactionsSchema>;

@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class ListSocialCommentReactionsInteractor extends AuthenticatedInteractor<
  ListSocialCommentReactionsData,
  SocialReactionList
> {
  constructor(
    private accountRepo: FindUsableAccountRepo,
    private messagingService: MessagingService,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(ListSocialCommentReactionsSchema)
  @ValidateOutput(SocialReactionListSchema)
  async invoke(data: ListSocialCommentReactionsData): Validated<SocialReactionList> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const account = await this.accountRepo.findUsableAccountByIdOrThrow(data.connectedAccountId);

    if (!isSocialProvider(account.provider))
      return fail(CustomErrorCode.socialPostsRequireSocialAccount, [], { provider: account.provider });

    const res = await this.messagingService.listCommentReactions({
      accountId: account.unipileAccountId,
      postId: data.postId,
      commentId: data.commentId,
      cursor: data.cursor,
      offset: data.offset,
      limit: data.limit,
    });
    if (!res.ok) return fail(res.error, [], { retryAfter: formatRetryAfter(await getLocale(), res.retryAfterSeconds) });

    return { ok: true as const, data: res.data };
  }
}
