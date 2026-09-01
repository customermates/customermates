import type { Data, Validated } from "@/core/validation/validation.utils";
import type { RoutineDto } from "./routine.schema";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { RoutineDtoSchema } from "./routine.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

const Schema = z.object({ id: z.uuid() });

export type GetRoutineData = Data<typeof Schema>;

export abstract class GetRoutineRepo {
  abstract getRoutineByIdOrThrow(id: string): Promise<RoutineDto>;
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
    return { ok: true as const, data: await this.repo.getRoutineByIdOrThrow(data.id) };
  }
}
