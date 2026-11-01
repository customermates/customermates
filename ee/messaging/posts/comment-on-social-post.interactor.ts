import { CustomErrorCode } from "@/core/validation/validation.types";
import { fail } from "@/core/validation/interactor-failure-server";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { RecordRepo } from "@/features/records/record.repo";

import type { MessagingService } from "../messaging.service";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";

import { z } from "zod";

import { MessagingProvider, Resource } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { recordRequestHash } from "@/features/records/record-request-hash";
import { accountNeedsReconnect } from "../account-health";
import { isSocialProvider } from "../provider";
import { retryAfterPhrase } from "../retry-after.server";
import { requireManagedCompanyPage } from "./list-managed-company-pages.interactor";

export const CommentOnSocialPostSchema = z.object({
  connectedAccountId: z.uuid(),
  postId: z.string().min(1),
  text: z.string().trim().min(1).max(1250),
  replyToCommentId: z.string().min(1).optional(),
  commentAs: z.string().min(1).optional(),
  idempotencyKey: z.uuid().optional(),
});
type CommentOnSocialPostData = Data<typeof CommentOnSocialPostSchema>;

export const CommentOnSocialPostResultSchema = z.object({
  id: z.string(),
  repeated: z.boolean(),
});
export type CommentOnSocialPostResult = z.infer<typeof CommentOnSocialPostResultSchema>;

@TenantInteractor({ resource: Resource.inboxMessages, manage: "create" })
export class CommentOnSocialPostInteractor extends AuthenticatedInteractor<
  CommentOnSocialPostData,
  CommentOnSocialPostResult
> {
  constructor(
    private accountRepo: FindUsableAccountRepo,
    private messagingService: MessagingService,
    private entitlements: EntitlementService,
    private records: Pick<RecordRepo, "receipt" | "saveReceipt">,
  ) {
    super();
  }

  @Write({ input: CommentOnSocialPostSchema, output: CommentOnSocialPostResultSchema, tx: false })
  async invoke(data: CommentOnSocialPostData): Validated<CommentOnSocialPostResult> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const account = await this.accountRepo.findUsableAccountByIdOrThrow(data.connectedAccountId);

    if (!isSocialProvider(account.provider))
      return fail(CustomErrorCode.socialActionRequiresSocialAccount, [], { provider: account.provider });
    if (accountNeedsReconnect(account)) return fail(CustomErrorCode.unipileDisconnectedAccount, []);
    if (data.commentAs && account.provider !== MessagingProvider.linkedin)
      return fail(CustomErrorCode.linkedinProductRequiresLinkedin, ["commentAs"]);

    const { idempotencyKey, ...request } = data;
    const hash = recordRequestHash({ kind: "social-comment", request });
    if (idempotencyKey) {
      const receipt = await this.records.receipt(idempotencyKey, this.userId);
      if (receipt) {
        return receipt.requestHash === hash
          ? { ok: true as const, data: { ...CommentOnSocialPostResultSchema.parse(receipt.result), repeated: true } }
          : fail(CustomErrorCode.recordIdempotencyConflict, ["idempotencyKey"]);
      }
    }

    if (data.commentAs) {
      const page = await requireManagedCompanyPage(
        this.messagingService,
        account.unipileAccountId,
        data.commentAs,
        "commentAs",
      );
      if (!page.ok) return page;
    }

    const comment = await this.messagingService.addPostComment({
      accountId: account.unipileAccountId,
      postId: data.postId,
      text: data.text,
      replyToCommentId: data.replyToCommentId,
      commentAs: data.commentAs,
    });
    if (!comment.ok) return fail(comment.error, [], { retryAfter: await retryAfterPhrase(comment.retryAfterSeconds) });

    const result = { id: comment.data.id, repeated: false };
    if (idempotencyKey) await this.records.saveReceipt(idempotencyKey, this.userId, hash, result);

    return { ok: true as const, data: result };
  }
}
