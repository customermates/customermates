import type { Data, Validated } from "@/core/validation/validation.utils";
import type { RoutineRiskKind, RoutineRiskSeverity } from "@/generated/prisma";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";

const Schema = z.object({ routineId: z.uuid() });

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

@TenantInteractor({ resource: Resource.api, action: Action.readAll })
export class GetRoutineRisksInteractor extends AuthenticatedInteractor<GetRoutineRisksData, RoutineRiskDto[]> {
  constructor(private repo: GetRoutineRisksRepo) {
    super();
  }

  @Validate(Schema)
  async invoke(data: GetRoutineRisksData): Validated<RoutineRiskDto[]> {
    return { ok: true as const, data: await this.repo.getRoutineRisks(data.routineId) };
  }
}
