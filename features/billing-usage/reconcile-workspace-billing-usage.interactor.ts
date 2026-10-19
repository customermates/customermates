import type { ReconcileBillingUsageRepo } from "./reconcile-billing-usage.repo";

import { z } from "zod";

import { Enforce } from "@/core/decorators/enforce.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

const ReconcileWorkspaceBillingUsageSchema = z.object({ companyId: z.uuid() }).strict();
type ReconcileWorkspaceBillingUsageData = z.infer<typeof ReconcileWorkspaceBillingUsageSchema>;

@SystemInteractor
export class ReconcileWorkspaceBillingUsageInteractor {
  constructor(private repo: ReconcileBillingUsageRepo) {}

  @Enforce(ReconcileWorkspaceBillingUsageSchema)
  async invoke(input: ReconcileWorkspaceBillingUsageData): Promise<void> {
    await this.repo.reconcileWorkspaceUnscoped(input.companyId);
  }
}
