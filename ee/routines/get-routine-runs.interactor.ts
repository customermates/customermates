import type { Data, Validated } from "@/core/validation/validation.utils";
import type { RoutineRunDto } from "./routine.schema";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { RoutineRunDtoSchema } from "./routine.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

const Schema = z.object({
  routineId: z.uuid(),
  limit: z.number().int().min(1).max(100).default(25),
});

export type GetRoutineRunsData = Data<typeof Schema>;

export abstract class GetRoutineRunsRepo {
  abstract getRoutineRuns(routineId: string, limit: number): Promise<RoutineRunDto[]>;
}

@TenantInteractor({ resource: Resource.api, action: Action.readAll })
export class GetRoutineRunsInteractor extends AuthenticatedInteractor<GetRoutineRunsData, RoutineRunDto[]> {
  constructor(private repo: GetRoutineRunsRepo) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(z.array(RoutineRunDtoSchema))
  async invoke(data: GetRoutineRunsData): Validated<RoutineRunDto[]> {
    return { ok: true as const, data: await this.repo.getRoutineRuns(data.routineId, data.limit) };
  }
}
