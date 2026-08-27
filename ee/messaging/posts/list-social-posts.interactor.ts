import { CustomErrorCode } from "@/core/validation/validation.types";
import { fail } from "@/core/validation/interactor-failure-server";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import type { MessagingService } from "../messaging.service";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";
import type { SocialPostList } from "./social-posts.schema";

import { z } from "zod";
import { getLocale } from "next-intl/server";

import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { isSocialProvider } from "../provider";
import { formatRetryAfter } from "../retry-after";
import { SocialPostListSchema } from "./social-posts.schema";

const ConnectedAccountIdSchema = z.uuid().describe("Connected-account ID for the LinkedIn or Instagram account to use");
const AuthorIdentifierSchema = z.string().min(1).describe("'me' or the provider person ID whose posts to list");
const LimitSchema = z.number().int().min(1).max(100).describe("Maximum posts to return (1-100)");

const FirstSocialPostsPageSchema = z
  .object({
    connectedAccountId: ConnectedAccountIdSchema,
    authorIdentifier: AuthorIdentifierSchema.default("me"),
    limit: LimitSchema.default(10),
  })
  .strict()
  .meta({ title: "First page" });

const CursorSocialPostsPageSchema = z
  .object({
    connectedAccountId: ConnectedAccountIdSchema,
    authorIdentifier: AuthorIdentifierSchema.describe("Repeat the author identifier from the previous request"),
    cursor: z.string().min(1).describe("Pass the previous response's next_cursor unchanged"),
    limit: LimitSchema.describe("Repeat the limit from the previous request"),
  })
  .strict()
  .meta({ title: "Cursor continuation" });

const OffsetSocialPostsPageSchema = z
  .object({
    connectedAccountId: ConnectedAccountIdSchema,
    authorIdentifier: AuthorIdentifierSchema.describe("Repeat the author identifier from the previous request"),
    offset: z.number().int().positive().describe("Cumulative number of posts already returned"),
    limit: LimitSchema.describe("Repeat the limit from the previous request"),
  })
  .strict()
  .meta({ title: "Offset continuation" });

export const ListSocialPostsSchema = z
  .union([FirstSocialPostsPageSchema, CursorSocialPostsPageSchema, OffsetSocialPostsPageSchema])
  .describe(
    "First page: omit cursor and offset. Continuation: repeat connectedAccountId, authorIdentifier and limit, then pass either next_cursor as cursor or a positive cumulative offset",
  );
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

    if (!isSocialProvider(account.provider))
      return fail(CustomErrorCode.socialPostsRequireSocialAccount, [], { provider: account.provider });

    const res = await this.messagingService.listUserPosts({
      accountId: account.unipileAccountId,
      userId: data.authorIdentifier,
      cursor: "cursor" in data ? data.cursor : undefined,
      offset: "offset" in data ? data.offset : undefined,
      limit: data.limit,
    });
    if (!res.ok) return fail(res.error, [], { retryAfter: formatRetryAfter(await getLocale(), res.retryAfterSeconds) });

    return { ok: true as const, data: res.data };
  }
}
