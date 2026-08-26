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

type ListSocialPostsDescriptions = {
  connectedAccountId: string;
  authorIdentifier: string;
};

const REST_DESCRIPTIONS: ListSocialPostsDescriptions = {
  connectedAccountId: "LinkedIn or Instagram connected-account ID returned by GET /v1/messaging/connected-accounts",
  authorIdentifier:
    "Person whose posts to list: 'me', or a top-level id returned by a social profile, post or engagement response. Resolve a messaging thread participant's identifier through the social-profile endpoint first",
};

export function createListSocialPostsContractSchema(descriptions: ListSocialPostsDescriptions = REST_DESCRIPTIONS) {
  const connectedAccountId = z.uuid().describe(descriptions.connectedAccountId);
  const authorIdentifier = z.string().min(1).describe(descriptions.authorIdentifier);
  const limit = z.number().int().min(1).max(100);

  const firstPage = z
    .object({
      connectedAccountId,
      authorIdentifier: authorIdentifier.default("me"),
      cursor: z.never().optional().describe("Omit on the first page"),
      offset: z.literal(0).optional().describe("Omit on the first page; zero is treated as omitted"),
      limit: limit.default(10).describe("Maximum posts to return (1-100, default 10)"),
    })
    .strict()
    .meta({ title: "First page" });

  const cursorPage = z
    .object({
      connectedAccountId,
      authorIdentifier: authorIdentifier.describe(
        `${descriptions.authorIdentifier}. Repeat the exact value from the previous page`,
      ),
      cursor: z.string().min(1).describe("Pass the previous response's next_cursor unchanged"),
      offset: z.never().optional().describe("Omit when cursor is present"),
      limit: limit.describe("Repeat the exact limit from the previous page (1-100)"),
    })
    .strict()
    .meta({ title: "Cursor continuation" });

  const offsetPage = z
    .object({
      connectedAccountId,
      authorIdentifier: authorIdentifier.describe(
        `${descriptions.authorIdentifier}. Repeat the exact value from the previous page`,
      ),
      cursor: z.never().optional().describe("Omit when offset is present"),
      offset: z.number().int().min(1).describe("Cumulative number of posts already returned"),
      limit: limit.describe("Repeat the exact limit from the previous page (1-100)"),
    })
    .strict()
    .meta({ title: "Offset continuation" });

  return z
    .union([firstPage, cursorPage, offsetPage])
    .describe(
      "First page: omit cursor and offset. Continuation: repeat connectedAccountId, authorIdentifier and limit, then pass either next_cursor as cursor or a positive cumulative offset",
    );
}

export const ListSocialPostsSchema = z
  .object({
    connectedAccountId: z.uuid().describe(REST_DESCRIPTIONS.connectedAccountId),
    authorIdentifier: z.string().min(1).default("me").describe(REST_DESCRIPTIONS.authorIdentifier),
    cursor: z.string().min(1).optional().describe("Cursor returned as next_cursor by the previous page"),
    offset: z.number().int().min(0).optional().describe("Cumulative number of posts already returned"),
    limit: z.number().int().min(1).max(100).default(10).describe("Maximum posts to return (1-100, default 10)"),
  })
  .superRefine((data, context) => {
    if (data.cursor !== undefined && data.offset !== undefined) {
      context.addIssue({
        code: "custom",
        message: "Use either cursor or offset, not both",
        path: ["offset"],
      });
    }
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
