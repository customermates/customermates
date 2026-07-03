import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";

import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

export const DiscardDraftSchema = z.object({ messageId: z.uuid() });
export type DiscardDraftData = Data<typeof DiscardDraftSchema>;

export abstract class DiscardDraftRepo {
  abstract deleteDraft(args: { messageId: string }): Promise<{ messagingThreadId: string } | null>;
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.delete })
export class DiscardDraftInteractor extends AuthenticatedInteractor<DiscardDraftData, { threadId: string | null }> {
  constructor(private repo: DiscardDraftRepo) {
    super();
  }

  @Validate(DiscardDraftSchema)
  @ValidateOutput(z.object({ threadId: z.string().nullable() }))
  async invoke(data: DiscardDraftData): Validated<{ threadId: string | null }> {
    const result = await this.repo.deleteDraft({ messageId: data.messageId });

    return { ok: true as const, data: { threadId: result?.messagingThreadId ?? null } };
  }
}
