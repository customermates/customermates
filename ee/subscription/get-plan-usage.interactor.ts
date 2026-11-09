import type { Validated } from "@/core/validation/validation.utils";
import type { PlanLimitsService, PlanUsageSnapshot } from "./plan-limits.service";

import { z } from "zod";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { PLAN_IDS } from "@/core/commercial/plan-catalog";

const PlanUsageSchema = z.object({
  plan: z.enum(PLAN_IDS).nullable(),
  limits: z
    .object({
      maxMembers: z.number(),
      maxRecords: z.number(),
      fileStorageBytes: z.number(),
      apiRequestsPerMinute: z.number(),
      apiRequestsPerDay: z.number(),
    })
    .nullable(),
  usage: z.object({
    members: z.number(),
    pausedMembers: z.number(),
    records: z.number(),
    storageBytes: z.number(),
    apiRequestsToday: z.number(),
  }),
});

export type PlanUsageDto = PlanUsageSnapshot;

@AllowInDemoMode
@TenantInteractor()
export class GetPlanUsageInteractor extends AuthenticatedInteractor<void, PlanUsageDto> {
  constructor(private limits: Pick<PlanLimitsService, "snapshot">) {
    super();
  }

  @ValidateOutput(PlanUsageSchema)
  async invoke(): Validated<PlanUsageDto> {
    return { ok: true, data: await this.limits.snapshot(this.companyId) };
  }
}
