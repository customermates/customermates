import type { ThreadAccountOwnersRepo } from "../inbox/thread-account-owners.repo";
import type { ListReviewDraftsRepo } from "./list-review-drafts.repo";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { Resource } from "@/generated/prisma";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { MessagingThreadSchema } from "../messaging.schema";
import { MessagingMessageDtoSchema, toMessagingMessageDto } from "../inbox/inbox.schema";

export const REVIEW_DRAFTS_MAX = 50;
export const REVIEW_DRAFT_HISTORY_SIZE = 4;

const Schema = z.object({
  limit: z.number().int().min(1).max(REVIEW_DRAFTS_MAX).optional(),
  countOnly: z.boolean().optional(),
});
type ListReviewDraftsData = Data<typeof Schema>;

const ReviewDraftSchema = z.object({
  draft: MessagingMessageDtoSchema,
  thread: MessagingThreadSchema,
  history: z.array(MessagingMessageDtoSchema),
  accountLabel: z.string().nullable(),
});
export type ReviewDraft = Data<typeof ReviewDraftSchema>;

export const ListReviewDraftsResultSchema = z.object({
  items: z.array(ReviewDraftSchema),
  total: z.number().int(),
});
export type ListReviewDraftsResult = Data<typeof ListReviewDraftsResultSchema>;

@AllowInDemoMode
@TenantInteractor({ resource: Resource.inboxMessages, read: true })
export class ListReviewDraftsInteractor extends AuthenticatedInteractor<ListReviewDraftsData, ListReviewDraftsResult> {
  constructor(
    private repo: ListReviewDraftsRepo,
    private accountRepo: ThreadAccountOwnersRepo,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(ListReviewDraftsResultSchema)
  async invoke(data: ListReviewDraftsData = {}): Validated<ListReviewDraftsResult> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const { entries, total } = await this.repo.listReviewDrafts({
      limit: data.countOnly ? 0 : (data.limit ?? REVIEW_DRAFTS_MAX),
      historySize: REVIEW_DRAFT_HISTORY_SIZE,
    });
    const owners = await this.accountRepo.listAccountOwnersByIds([
      ...new Set(entries.map((entry) => entry.thread.connectedAccountId)),
    ]);

    return {
      ok: true as const,
      data: {
        items: entries.map((entry) => ({
          draft: toMessagingMessageDto(entry.draft),
          thread: entry.thread,
          history: entry.history.map(toMessagingMessageDto),
          accountLabel: owners[entry.thread.connectedAccountId]?.accountLabel ?? null,
        })),
        total,
      },
    };
  }
}
