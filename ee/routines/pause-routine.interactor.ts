import type { Data, Validated } from "@/core/validation/validation.utils";
import type { RoutineDto } from "./routine.schema";
import type { EventService } from "@/features/event/event.service";

import { Resource } from "@/generated/prisma";

import { z } from "zod";

import { DomainEvent } from "@/features/event/domain-events";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { failAuthorization } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { RoutineDtoSchema } from "./routine.schema";
import type { PauseRoutineRepo } from "./pause-routine.repo";

const Schema = z.object({ routineId: z.uuid() });

export type PauseRoutineData = Data<typeof Schema>;

@TenantInteractor({ resource: Resource.routines, manage: "delete" })
export class PauseRoutineInteractor extends AuthenticatedInteractor<PauseRoutineData, RoutineDto> {
  constructor(
    private repo: PauseRoutineRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Write({ input: Schema, output: RoutineDtoSchema })
  async invoke(data: PauseRoutineData): Validated<RoutineDto> {
    if (!this.user.role?.isSystemRole || !(await this.repo.isActiveSystemAdministrator(this.user.id)))
      return failAuthorization(CustomErrorCode.routineAdminRequired);

    const previous = await this.repo.getRoutineByIdOrThrow(data.routineId);
    const routine = await this.repo.pauseRoutineOrThrow(data.routineId, new Date());

    await this.eventService.publish(DomainEvent.ROUTINE_UPDATED, {
      entityId: routine.id,
      payload: {
        routine,
        changes: calculateChanges(previous, routine),
      },
    });

    return { ok: true as const, data: routine };
  }
}
