import { CustomErrorCode } from "@/core/validation/validation.types";
import { fail } from "@/core/validation/interactor-failure-server";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { FileStorageDrivers } from "@/core/storage/file-storage-driver";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { RecordRepo } from "@/features/records/record.repo";
import type { RecordFileAccessService } from "@/features/record-files/record-file-access.service";

import type { MessagingService } from "../messaging.service";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";

import { getLocale } from "next-intl/server";
import { z } from "zod";

import { MessagingProvider, Resource } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { readCappedStream } from "@/core/storage/read-capped-stream";
import { fileSizeLabel } from "@/core/utils/format-bytes";
import { recordRequestHash } from "@/features/records/record-request-hash";
import { accountNeedsReconnect } from "../account-health";
import { isSocialProvider } from "../provider";
import { retryAfterPhrase } from "../retry-after.server";

export const SOCIAL_POST_ATTACHMENTS_MAX_BYTES = 25 * 1024 * 1024;

export const PublishSocialPostSchema = z
  .object({
    connectedAccountId: z.uuid(),
    text: z.string().max(3000),
    fileIds: z.array(z.uuid()).min(1).max(10).optional(),
    visibility: z.enum(["anyone", "relations_only"]).optional(),
    firstComment: z.string().trim().min(1).max(1250).optional(),
    idempotencyKey: z.uuid().optional(),
  })
  .superRefine((d, ctx) => {
    if (!d.text.trim() && !d.fileIds?.length) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.messageContentRequired },
        path: ["text"],
      });
    }
  });
type PublishSocialPostData = Data<typeof PublishSocialPostSchema>;

export const PublishSocialPostResultSchema = z.object({
  id: z.string(),
  share_url: z.string().nullable(),
  created_at: z.string().nullable(),
  comment_id: z.string().nullable(),
  comment_error: z.string().nullable(),
  repeated: z.boolean(),
});
export type PublishSocialPostResult = z.infer<typeof PublishSocialPostResultSchema>;

@TenantInteractor({ resource: Resource.inboxMessages, manage: "create" })
export class PublishSocialPostInteractor extends AuthenticatedInteractor<
  PublishSocialPostData,
  PublishSocialPostResult
> {
  constructor(
    private accountRepo: FindUsableAccountRepo,
    private messagingService: MessagingService,
    private entitlements: EntitlementService,
    private records: Pick<RecordRepo, "receipt" | "saveReceipt">,
    private files: Pick<RecordFileAccessService, "readableFile">,
    private drivers: FileStorageDrivers,
  ) {
    super();
  }

  @Write({ input: PublishSocialPostSchema, output: PublishSocialPostResultSchema, tx: false })
  async invoke(data: PublishSocialPostData): Validated<PublishSocialPostResult> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const account = await this.accountRepo.findUsableAccountByIdOrThrow(data.connectedAccountId);

    if (!isSocialProvider(account.provider))
      return fail(CustomErrorCode.socialActionRequiresSocialAccount, [], { provider: account.provider });
    if (accountNeedsReconnect(account)) return fail(CustomErrorCode.unipileDisconnectedAccount, []);
    if (data.visibility && account.provider !== MessagingProvider.linkedin)
      return fail(CustomErrorCode.linkedinProductRequiresLinkedin, ["visibility"]);

    const { idempotencyKey, ...request } = data;
    const hash = recordRequestHash({ kind: "social-post", request });
    if (idempotencyKey) {
      const receipt = await this.records.receipt(idempotencyKey, this.userId);
      if (receipt) {
        return receipt.requestHash === hash
          ? { ok: true as const, data: { ...PublishSocialPostResultSchema.parse(receipt.result), repeated: true } }
          : fail(CustomErrorCode.recordIdempotencyConflict, ["idempotencyKey"]);
      }
    }

    const attachments = [];
    let totalBytes = 0;
    for (const fileId of data.fileIds ?? []) {
      const readable = await this.files.readableFile(fileId);
      if (!readable.ok) return readable;
      const file = readable.data;
      totalBytes += file.size;
      if (totalBytes > SOCIAL_POST_ATTACHMENTS_MAX_BYTES) return this.tooLarge();
      const stored = await this.drivers(file.storageDriver).read(file.storageKey);
      if (!stored) return fail(CustomErrorCode.recordFileNotFound, ["fileIds"]);
      const bytes = await readCappedStream(stored.stream, SOCIAL_POST_ATTACHMENTS_MAX_BYTES);
      if (!bytes.ok) return this.tooLarge();
      attachments.push({
        filename: file.name,
        content_type: file.mimeType,
        content: Buffer.from(bytes.bytes).toString("base64"),
      });
    }

    const post = await this.messagingService.createPost({
      accountId: account.unipileAccountId,
      text: data.text,
      attachments: attachments.length ? attachments : undefined,
      canRead: data.visibility,
    });
    if (!post.ok) return fail(post.error, [], { retryAfter: await retryAfterPhrase(post.retryAfterSeconds) });

    const comment = data.firstComment
      ? await this.messagingService.addPostComment({
          accountId: account.unipileAccountId,
          postId: post.data.id,
          text: data.firstComment,
        })
      : null;

    const result = {
      id: post.data.id,
      share_url: post.data.share_url ?? null,
      created_at: post.data.created_at ?? null,
      comment_id: comment?.ok ? comment.data.id : null,
      comment_error: comment && !comment.ok ? comment.error : null,
      repeated: false,
    };
    if (idempotencyKey) await this.records.saveReceipt(idempotencyKey, this.userId, hash, result);

    return { ok: true as const, data: result };
  }

  private async tooLarge() {
    return fail(CustomErrorCode.recordFileTooLarge, ["fileIds"], {
      limit: fileSizeLabel(SOCIAL_POST_ATTACHMENTS_MAX_BYTES, await getLocale()),
    });
  }
}
