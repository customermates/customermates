import type { Data, Validated } from "@/core/validation/validation.utils";
import type { RoutineDto } from "./routine.schema";

import { z } from "zod";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { failAuthorization } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { RoutineDtoSchema } from "./routine.schema";

const Schema = z.object({ routineId: z.uuid() });

export type PauseRoutineData = Data<typeof Schema>;

export abstract class PauseRoutineRepo {
  abstract isActiveSystemAdministrator(userId: string): Promise<boolean>;
  abstract pauseRoutineOrThrow(routineId: string, now: Date): Promise<RoutineDto>;
}

@TenantInteractor()
export class PauseRoutineInteractor extends AuthenticatedInteractor<PauseRoutineData, RoutineDto> {
  constructor(private repo: PauseRoutineRepo) {
    super();
  }

  @Write({ input: Schema, output: RoutineDtoSchema })
  async invoke(data: PauseRoutineData): Validated<RoutineDto> {
    if (!this.user.role?.isSystemRole || !(await this.repo.isActiveSystemAdministrator(this.user.id)))
      return failAuthorization(CustomErrorCode.routineAdminRequired);

    return {
      ok: true as const,
      data: await this.repo.pauseRoutineOrThrow(data.routineId, new Date()),
    };
  }
}
