import type { Validated } from "@/core/validation/validation.utils";
import type { PlanFitUsage } from "@/core/commercial/plan-fit";
import type { PlanLimitsService } from "./plan-limits.service";

import { z } from "zod";

import { Resource } from "@/generated/prisma";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

const PlanFitSchema = z.object({
  members: z.number(),
  connectedAccounts: z.number(),
  maxAccountsPerUser: z.number(),
  sharedAccounts: z.number(),
  openDrafts: z.number(),
  activeRoutines: z.number(),
  maxRoutinesPerOwner: z.number(),
  webhooks: z.number(),
  mateRequests: z.number(),
  apiClients: z.number(),
});

@AllowInDemoMode
@TenantInteractor({ resource: Resource.company, read: true })
export class GetPlanFitInteractor extends AuthenticatedInteractor<void, PlanFitUsage> {
  constructor(private limits: Pick<PlanLimitsService, "fit">) {
    super();
  }

  @ValidateOutput(PlanFitSchema)
  async invoke(): Validated<PlanFitUsage> {
    return { ok: true, data: await this.limits.fit(this.companyId) };
  }
}
