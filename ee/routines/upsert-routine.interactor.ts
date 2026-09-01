import type { RoutineDto, UpsertRoutineData } from "./routine.schema";
import type { Validated } from "@/core/validation/validation.utils";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";

import { Resource, Action, RoutineTriggerKind } from "@/generated/prisma";

import { RoutineDtoSchema, UpsertRoutineSchema } from "./routine.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

export abstract class UpsertRoutineRepo {
  abstract upsertRoutineOrThrow(args: UpsertRoutineData): Promise<RoutineDto>;
  abstract getRoutineByIdOrThrow(id: string): Promise<RoutineDto>;
}

@TenantInteractor({ resource: Resource.api, action: Action.update })
export class UpsertRoutineInteractor extends AuthenticatedInteractor<UpsertRoutineData, RoutineDto> {
  constructor(
    private repo: UpsertRoutineRepo,
    private backgroundTaskService: BackgroundTaskService,
  ) {
    super();
  }

  @Write({ input: UpsertRoutineSchema, output: RoutineDtoSchema })
  async invoke(data: UpsertRoutineData): Validated<RoutineDto> {
    const routine = await this.repo.upsertRoutineOrThrow(data);

    if (routine.triggerKind === RoutineTriggerKind.event)
      await this.backgroundTaskService.dispatch("analyze-routine-loops", { companyId: this.user.companyId });

    return { ok: true as const, data: routine };
  }
}
