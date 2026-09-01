import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { RoutineDto } from "./routine.schema";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { failAuthorization } from "@/core/validation/interactor-failure-server";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Write } from "@/core/decorators/write.decorator";

const Schema = z.object({ routineId: z.uuid() });

export type RunRoutineNowData = Data<typeof Schema>;

export abstract class RunRoutineNowRepo {
  abstract getRoutineByIdOrThrow(id: string): Promise<RoutineDto>;
  abstract createManualRoutineRunOrThrow(routineId: string, now: Date): Promise<{ id: string }>;
}

@TenantInteractor({ resource: Resource.api, action: Action.update })
export class RunRoutineNowInteractor extends AuthenticatedInteractor<RunRoutineNowData, string> {
  constructor(
    private repo: RunRoutineNowRepo,
    private backgroundTaskService: BackgroundTaskService,
  ) {
    super();
  }

  @Write({ input: Schema, output: z.string() })
  async invoke(data: RunRoutineNowData): Validated<string> {
    const routine = await this.repo.getRoutineByIdOrThrow(data.routineId);
    if (routine.ownerUserId !== this.user.id) return failAuthorization(CustomErrorCode.routineRunNotOwner);

    const run = await this.repo.createManualRoutineRunOrThrow(routine.id, new Date());

    await this.backgroundTaskService.dispatch("run-routine", {
      routineRunId: run.id,
      companyId: this.user.companyId,
      ownerUserId: routine.ownerUserId,
    });

    return { ok: true as const, data: run.id };
  }
}
