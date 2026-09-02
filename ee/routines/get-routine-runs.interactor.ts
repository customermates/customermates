import type { Data, Validated } from "@/core/validation/validation.utils";
import type { RoutineRunPage } from "./routine-history";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { ROUTINE_RUN_PAGE_SIZE, RoutineRunPageSchema } from "./routine-history";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

const Schema = z.object({
  routineId: z.uuid(),
  cursor: z.string().max(500).nullable().optional(),
});

export type GetRoutineRunsData = Data<typeof Schema>;

export abstract class GetRoutineRunsRepo {
  abstract getRoutineRuns(routineId: string, limit: number, cursor?: string | null): Promise<RoutineRunPage>;
}

@AllowInDemoMode
@TenantInteractor({ resource: Resource.api, action: Action.readAll })
export class GetRoutineRunsInteractor extends AuthenticatedInteractor<GetRoutineRunsData, RoutineRunPage> {
  constructor(private repo: GetRoutineRunsRepo) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(RoutineRunPageSchema)
  async invoke(data: GetRoutineRunsData): Validated<RoutineRunPage> {
    return {
      ok: true as const,
      data: await this.repo.getRoutineRuns(data.routineId, ROUTINE_RUN_PAGE_SIZE, data.cursor),
    };
  }
}
