import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action, RoutineRiskKind, RoutineRiskSeverity } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

const Schema = z.object({ routineId: z.uuid() });

const RoutineRiskDtoSchema = z.object({
  id: z.uuid(),
  kind: z.enum(RoutineRiskKind),
  severity: z.enum(RoutineRiskSeverity),
  triggerEvent: z.string(),
  peerRoutineId: z.uuid().nullable(),
  confidence: z.string(),
});

export type GetRoutineRisksData = Data<typeof Schema>;

export type RoutineRiskDto = {
  id: string;
  kind: RoutineRiskKind;
  severity: RoutineRiskSeverity;
  triggerEvent: string;
  peerRoutineId: string | null;
  confidence: string;
};

export abstract class GetRoutineRisksRepo {
  abstract getRoutineRisks(routineId: string): Promise<RoutineRiskDto[]>;
}

@AllowInDemoMode
@TenantInteractor({ resource: Resource.api, action: Action.readAll })
export class GetRoutineRisksInteractor extends AuthenticatedInteractor<GetRoutineRisksData, RoutineRiskDto[]> {
  constructor(private repo: GetRoutineRisksRepo) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(RoutineRiskDtoSchema)
  async invoke(data: GetRoutineRisksData): Validated<RoutineRiskDto[]> {
    return { ok: true as const, data: await this.repo.getRoutineRisks(data.routineId) };
  }
}
