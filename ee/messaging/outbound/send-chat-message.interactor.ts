import type { Data, Validated } from "@/core/validation/validation.utils";

import type { MessagingThread } from "../messaging.schema";
import type { MessagingService } from "../messaging.service";
import type { FindUsableAccountRepo } from "../persistence/find-usable-account.repo";

import { z } from "zod";
import { getTranslations } from "next-intl/server";

import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { createZodError } from "@/core/validation/validation.utils";
import { validateThreadIds } from "@/core/validation/ids-validators";
import { getMessagingRepo } from "@/core/di";

export const SendChatMessageSchema = z.object({
  threadId: z.uuid(),
  text: z.string().min(1).max(20_000),
});
export type SendChatMessageData = Data<typeof SendChatMessageSchema>;

export const SendChatMessageValidateSchema = SendChatMessageSchema.superRefine(async (data, ctx) => {
  const validIdsSet = await getMessagingRepo().findThreadIds(new Set([data.threadId]));
  validateThreadIds(data.threadId, validIdsSet, ctx, ["threadId"]);
});

export abstract class SendChatMessageRepo {
  abstract findThreadByIdOrThrow(threadId: string): Promise<MessagingThread>;
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class SendChatMessageInteractor extends AuthenticatedInteractor<SendChatMessageData, null> {
  constructor(
    private repo: SendChatMessageRepo,
    private accountRepo: FindUsableAccountRepo,
    private messagingService: MessagingService,
  ) {
    super();
  }

  @Validate(SendChatMessageValidateSchema)
  async invoke(data: SendChatMessageData): Validated<null> {
    const thread = await this.repo.findThreadByIdOrThrow(data.threadId);

    await this.accountRepo.findUsableAccountByIdOrThrow(thread.connectedAccountId);

    const res = await this.messagingService.sendChatMessage({
      chatId: thread.unipileThreadId,
      text: data.text,
    });

    if (!res.ok) {
      const t = await getTranslations();
      return {
        ok: false,
        error: createZodError<null>(t(`Common.errors.${res.error}`)),
      };
    }

    return { ok: true as const, data: null };
  }
}
