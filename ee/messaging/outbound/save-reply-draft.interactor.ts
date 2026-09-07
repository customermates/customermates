import type { Data, Validated } from "@/core/validation/validation.utils";
import type { MessagingMessageDto } from "../inbox/inbox.schema";
import type { SaveDraftInteractor } from "./save-draft.interactor";

import { z } from "zod";

import { Action, Resource } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";

import { SaveReplyDraftBodySchema } from "./save-draft.interactor";

export const SaveReplyDraftSchema = z
  .object({
    threadId: z.uuid(),
    draft: SaveReplyDraftBodySchema,
  })
  .strict();
export type SaveReplyDraftData = Data<typeof SaveReplyDraftSchema>;

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class SaveReplyDraftInteractor extends AuthenticatedInteractor<SaveReplyDraftData, MessagingMessageDto> {
  constructor(private readonly saveDraft: SaveDraftInteractor) {
    super();
  }

  @Validate(SaveReplyDraftSchema)
  async invoke(data: SaveReplyDraftData): Validated<MessagingMessageDto> {
    return this.saveDraft.invoke({ ...data.draft, threadId: data.threadId });
  }
}
