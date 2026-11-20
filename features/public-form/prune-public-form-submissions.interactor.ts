import type { PublicFormRepo } from "./public-form.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { pruneInBatches } from "@/core/utils/prune-in-batches";

export const PUBLIC_FORM_SUBMISSION_RETENTION_DAYS = 400;

@SystemInteractor
export class PrunePublicFormSubmissionsInteractor {
  constructor(private repo: Pick<PublicFormRepo, "deleteSubmissionsBeforeUnscoped">) {}

  async invoke(args: { now?: Date } = {}): Promise<{ pruned: number }> {
    const now = args.now ?? new Date();
    const before = new Date(now.getTime() - PUBLIC_FORM_SUBMISSION_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    return { pruned: await pruneInBatches((limit) => this.repo.deleteSubmissionsBeforeUnscoped(before, limit)) };
  }
}
