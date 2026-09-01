import type { Data, Validated } from "@/core/validation/validation.utils";
import type { RoutineDto } from "./routine.schema";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { RoutineDtoSchema } from "./routine.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

const Schema = z.object({ id: z.uuid() });

export type GetRoutineData = Data<typeof Schema>;

export abstract class GetRoutineRepo {
  abstract findRoutineById(id: string): Promise<RoutineDto | null>;
}

@AllowInDemoMode
@TenantInteractor({ resource: Resource.api, action: Action.readAll })
export class GetRoutineInteractor extends AuthenticatedInteractor<GetRoutineData, RoutineDto> {
  constructor(private repo: GetRoutineRepo) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(RoutineDtoSchema)
  async invoke(data: GetRoutineData): Validated<RoutineDto> {
    const routine = await this.repo.findRoutineById(data.id);
    if (!routine) return failNotFound(CustomErrorCode.routineNotFound, ["id"]);

    return { ok: true as const, data: routine };
  }
}
