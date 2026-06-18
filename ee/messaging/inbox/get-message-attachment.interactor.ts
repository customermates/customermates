import type { MessagingService } from "../messaging.service";
import type { Data } from "@/core/validation/validation.utils";

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
    unipileMessageId: string;
    provider: MessagingProvider;
    mime: string | null;
    fileName: string | null;
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
  ) {
    super();
  }

  @Enforce(Schema)
  async invoke(data: GetMessageAttachmentData): Promise<{ ok: true; data: MessageAttachment }> {
    const meta = await this.repo.findAttachmentForMessageOrThrow(data);

    const { body, contentType } = await this.messagingService.fetchMessageAttachment({
      provider: meta.provider,
      unipileMessageId: meta.unipileMessageId,
      attachmentId: data.attachmentId,
    });

    return {
      ok: true as const,
      data: { body, contentType: contentType ?? meta.mime ?? "application/octet-stream", fileName: meta.fileName },
    };
  }
}
