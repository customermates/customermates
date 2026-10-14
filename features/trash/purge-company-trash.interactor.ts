import type { TrashExpiryCursor, TrashRepo } from "./trash.repo";
import type { TrashKindHandler } from "./trash-kind-handler";

import { z } from "zod";

import { Enforce } from "@/core/decorators/enforce.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { purgeTrashItems } from "./purge-trash-items";

export const TRASH_PURGE_BATCH_SIZE = 100;

const PurgeCompanyTrashSchema = z
  .object({
    companyId: z.uuid(),
    now: z.iso.datetime(),
    after: z.object({ expiresAt: z.iso.datetime(), id: z.uuid() }).strict().nullable(),
  })
  .strict();
type PurgeCompanyTrashData = z.infer<typeof PurgeCompanyTrashSchema>;

export type CompanyTrashPurgeBatch = {
  next: TrashExpiryCursor | null;
  deleted: number;
  pending: number;
  failed: number;
};

@SystemInteractor
export class PurgeCompanyTrashInteractor {
  constructor(
    private trash: (companyId: string) => TrashRepo,
    private handlers: (companyId: string) => TrashKindHandler[],
  ) {}

  @Enforce(PurgeCompanyTrashSchema)
  async invoke(input: PurgeCompanyTrashData): Promise<CompanyTrashPurgeBatch> {
    const trash = this.trash(input.companyId);
    const items = await trash.findExpired(new Date(input.now), TRASH_PURGE_BATCH_SIZE, input.after ?? undefined);
    const outcome = await purgeTrashItems(trash, this.handlers(input.companyId), items, {
      companyId: input.companyId,
      actorId: null,
    });
    const last = items.at(-1);
    return {
      next:
        items.length === TRASH_PURGE_BATCH_SIZE && last
          ? { expiresAt: last.expiresAt.toISOString(), id: last.id }
          : null,
      deleted: outcome.deletedItemIds.length,
      pending: outcome.pendingItemIds.length,
      failed: outcome.failedItemIds.length,
    };
  }
}
