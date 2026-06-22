import type { MessagingThreadState } from "../messaging.schema";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { validateThreadIds } from "@/core/validation/ids-validators";
import { getMessagingRepo } from "@/core/di";

import { MessagingThreadStateSchema } from "../messaging.schema";

const Schema = z
  .object({
    threadId: z.uuid(),
    state: MessagingThreadStateSchema.optional(),
    sharedToCrm: z.boolean().optional(),
  })
  .superRefine(async (data, ctx) => {
    const validIdsSet = await getMessagingRepo().findThreadIds(new Set([data.threadId]));
    validateThreadIds(data.threadId, validIdsSet, ctx, ["threadId"]);
  });
export type UpdateThreadData = Data<typeof Schema>;

export abstract class UpdateThreadRepo {
  abstract setThreadState(args: { threadId: string; state: MessagingThreadState }): Promise<void>;
  abstract setThreadSharedToCrm(args: { threadId: string; shared: boolean }): Promise<void>;
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.update })
export class UpdateThreadInteractor extends AuthenticatedInteractor<UpdateThreadData, null> {
  constructor(private repo: UpdateThreadRepo) {
    super();
  }

  @Validate(Schema)
  async invoke(data: UpdateThreadData): Validated<null> {
    if (data.state !== undefined) await this.repo.setThreadState({ threadId: data.threadId, state: data.state });
    if (data.sharedToCrm !== undefined)
      await this.repo.setThreadSharedToCrm({ threadId: data.threadId, shared: data.sharedToCrm });

    return { ok: true as const, data: null };
  }
}
