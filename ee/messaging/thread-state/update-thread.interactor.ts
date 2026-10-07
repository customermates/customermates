import type { ValidateThreadIdsInteractor } from "@/core/validation/validators/validate-thread-ids.interactor";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { z } from "zod";
import { Resource } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

import { MessagingThreadStateSchema } from "../messaging.schema";
import type { UpdateThreadRepo } from "./update-thread.repo";

export const UpdateThreadSchema = z.object({
  threadId: z.uuid(),
  state: MessagingThreadStateSchema.optional(),
  sharedToCrm: z.boolean().optional(),
});
export type UpdateThreadData = Data<typeof UpdateThreadSchema>;

@TenantInteractor({ resource: Resource.inboxMessages, manage: "update" })
export class UpdateThreadInteractor extends AuthenticatedInteractor<UpdateThreadData, null> {
  constructor(
    private repo: UpdateThreadRepo,
    private validator: ValidateThreadIdsInteractor,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Write({
    input: UpdateThreadSchema,
    tx: false,
    precheck: (self, data, ctx) => self.validator.invoke([{ ids: data.threadId, path: ["threadId"] }], ctx),
  })
  async invoke(data: UpdateThreadData): Validated<null> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    if (data.state !== undefined) await this.repo.setThreadState({ threadId: data.threadId, state: data.state });
    if (data.sharedToCrm !== undefined)
      await this.repo.setThreadSharedToCrm({ threadId: data.threadId, shared: data.sharedToCrm });

    return { ok: true as const, data: null };
  }
}
