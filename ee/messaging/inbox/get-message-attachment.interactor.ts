import type { MessagingService } from "../messaging.service";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { Resource } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import type { GetMessageAttachmentMetaRepo } from "./get-message-attachment.repo";

const Schema = z.object({ messageId: z.uuid(), attachmentId: z.string() });
type GetMessageAttachmentData = Data<typeof Schema>;

type MessageAttachment = {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  fileName: string | null;
};

@AllowInDemoMode
@TenantInteractor({ resource: Resource.inboxMessages, read: true })
export class GetMessageAttachmentInteractor extends AuthenticatedInteractor<
  GetMessageAttachmentData,
  MessageAttachment
> {
  constructor(
    private repo: GetMessageAttachmentMetaRepo,
    private messagingService: MessagingService,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(Schema)
  async invoke(data: GetMessageAttachmentData): Validated<MessageAttachment> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const meta = await this.repo.findAttachmentForMessageOrThrow(data);

    const { body, contentType } = await this.messagingService.downloadAttachment({
      accountId: meta.unipileAccountId,
      provider: meta.provider,
      chatId: meta.unipileThreadId,
      messageId: meta.unipileMessageId,
      attachmentId: data.attachmentId,
      fileName: meta.fileName,
      size: meta.size,
    });

    return {
      ok: true as const,
      data: { body, contentType: contentType ?? meta.mime ?? "application/octet-stream", fileName: meta.fileName },
    };
  }
}
