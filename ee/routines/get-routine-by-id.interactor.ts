import type { Data, Validated } from "@/core/validation/validation.utils";
import type { RoutineDto } from "./routine.schema";
import type { GetRoutineByIdRepo } from "./get-routine-by-id.repo";

import { Resource } from "@/generated/prisma";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { failNotFound } from "@/core/validation/interactor-failure-server";

import { z } from "zod";

import { RoutineDtoSchema } from "./routine.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export const GetRoutineByIdSchema = z.object({ id: z.uuid() });

type GetRoutineByIdData = Data<typeof GetRoutineByIdSchema>;

@AllowInDemoMode
@TenantInteractor({ resource: Resource.routines, read: true })
export class GetRoutineByIdInteractor extends AuthenticatedInteractor<GetRoutineByIdData, RoutineDto> {
  constructor(private repo: GetRoutineByIdRepo) {
    super();
  }

  @Validate(GetRoutineByIdSchema)
  @ValidateOutput(RoutineDtoSchema)
  async invoke(data: GetRoutineByIdData): Validated<RoutineDto> {
    const routine = await this.repo.findReadableRoutineById(data.id);
    if (!routine) return failNotFound(CustomErrorCode.routineNotFound, ["id"]);
    return { ok: true as const, data: routine };
  }
}
