import type { MessagingThread, MessagingThreadState } from "../messaging.schema";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

import { MessagingThreadStateSchema } from "../messaging.schema";

const SetThreadStateSchema = z.object({
  threadId: z.uuid(),
  state: MessagingThreadStateSchema,
});
export type SetThreadStateData = Data<typeof SetThreadStateSchema>;

export abstract class SetThreadStateRepo {
  abstract findThreadByIdOrThrow(threadId: string): Promise<MessagingThread>;
  abstract setThreadState(args: { threadId: string; state: MessagingThreadState }): Promise<void>;
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.update })
export class SetThreadStateInteractor extends AuthenticatedInteractor<SetThreadStateData, null> {
  constructor(private repo: SetThreadStateRepo) {
    super();
  }

  @Enforce(SetThreadStateSchema)
  async invoke(data: SetThreadStateData): Promise<{ ok: true; data: null }> {
    const thread = await this.repo.findThreadByIdOrThrow(data.threadId);

    await this.repo.setThreadState({ threadId: thread.id, state: data.state });

    return { ok: true as const, data: null };
  }
}
