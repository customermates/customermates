import type { Data, Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { z } from "zod";

import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { DraftRevisionSchema, draftUpdatedAtFromRevision, type DraftDeleteResult } from "../draft-thread";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export const DiscardDraftSchema = z.object({ messageId: z.uuid(), draftRevision: DraftRevisionSchema });
export type DiscardDraftData = Data<typeof DiscardDraftSchema>;

export abstract class DiscardDraftRepo {
  abstract deleteDraft(args: { messageId: string; expectedUpdatedAt: Date }): Promise<DraftDeleteResult>;
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.delete })
export class DiscardDraftInteractor extends AuthenticatedInteractor<DiscardDraftData, { threadId: string | null }> {
  constructor(
    private repo: DiscardDraftRepo,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(DiscardDraftSchema)
  @ValidateOutput(z.object({ threadId: z.string().nullable() }))
  async invoke(data: DiscardDraftData): Validated<{ threadId: string | null }> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const result = await this.repo.deleteDraft({
      messageId: data.messageId,
      expectedUpdatedAt: draftUpdatedAtFromRevision(data.draftRevision),
    });
    if (result.status === "revision_mismatch") return failNotFound(CustomErrorCode.draftMessageNotFound);

    return { ok: true as const, data: { threadId: result.status === "deleted" ? result.messagingThreadId : null } };
  }
}
