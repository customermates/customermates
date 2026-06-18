import type { MessagingThread } from "../messaging.schema";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

const ShareThreadToCrmSchema = z.object({
  threadId: z.uuid(),
  shared: z.boolean(),
});
export type ShareThreadToCrmData = Data<typeof ShareThreadToCrmSchema>;

export abstract class ShareThreadToCrmRepo {
  abstract findOwnedThreadByIdOrThrow(threadId: string): Promise<MessagingThread>;
  abstract setThreadSharedToCrm(args: { threadId: string; shared: boolean }): Promise<void>;
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.update })
export class ShareThreadToCrmInteractor extends AuthenticatedInteractor<ShareThreadToCrmData, null> {
  constructor(private repo: ShareThreadToCrmRepo) {
    super();
  }

  @Enforce(ShareThreadToCrmSchema)
  async invoke(data: ShareThreadToCrmData): Promise<{ ok: true; data: null }> {
    const thread = await this.repo.findOwnedThreadByIdOrThrow(data.threadId);

    await this.repo.setThreadSharedToCrm({
      threadId: thread.id,
      shared: data.shared,
    });

    return { ok: true as const, data: null };
  }
}
