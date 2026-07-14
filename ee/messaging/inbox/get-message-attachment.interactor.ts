import type { MessagingService } from "../messaging.service";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { Resource, Action, type MessagingProvider } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

const Schema = z.object({ messageId: z.uuid(), attachmentId: z.string() });
type GetMessageAttachmentData = Data<typeof Schema>;

type MessageAttachment = {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  fileName: string | null;
};

export abstract class GetMessageAttachmentMetaRepo {
  abstract findAttachmentForMessageOrThrow(args: { messageId: string; attachmentId: string }): Promise<{
    unipileAccountId: string;
    unipileThreadId: string;
    unipileMessageId: string;
    provider: MessagingProvider;
    mime: string | null;
    fileName: string | null;
    size: number | null;
  }>;
}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
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

  @Enforce(Schema)
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
