import type { Data, Validated } from "@/core/validation/validation.utils";
import type { MessagingMessageDto } from "../inbox/inbox.schema";
import type { SaveDraftInteractor } from "./save-draft.interactor";

import { Action, Resource } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";

import { SaveNewThreadDraftSchema } from "./save-draft.interactor";

export type SaveNewThreadDraftData = Data<typeof SaveNewThreadDraftSchema>;

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class SaveNewThreadDraftInteractor extends AuthenticatedInteractor<SaveNewThreadDraftData, MessagingMessageDto> {
  constructor(private readonly saveDraft: SaveDraftInteractor) {
    super();
  }

  @Validate(SaveNewThreadDraftSchema)
  async invoke(data: SaveNewThreadDraftData): Validated<MessagingMessageDto> {
    return this.saveDraft.invoke(data);
  }
}
