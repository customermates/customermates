import type { RoutineDto } from "./routine.schema";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { EventService } from "@/features/event/event.service";

import { Action, Resource } from "@/generated/prisma";

import { z } from "zod";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { failAuthorization, failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

const Schema = z.object({ id: z.uuid() });

export type DeleteRoutineData = Data<typeof Schema>;

export abstract class DeleteRoutineRepo {
  abstract isActiveSystemAdministrator(userId: string): Promise<boolean>;
  abstract deleteRoutineOrThrow(id: string): Promise<RoutineDto | null>;
}

@TenantInteractor({ resource: Resource.routines, action: Action.delete })
export class DeleteRoutineInteractor extends AuthenticatedInteractor<DeleteRoutineData, string> {
  constructor(
    private repo: DeleteRoutineRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Write({ input: Schema, output: z.string() })
  async invoke(data: DeleteRoutineData): Validated<string> {
    if (!this.user.role?.isSystemRole || !(await this.repo.isActiveSystemAdministrator(this.user.id)))
      return failAuthorization(CustomErrorCode.routineAdminRequired);

    const deleted = await this.repo.deleteRoutineOrThrow(data.id);
    if (!deleted) return failConflict(CustomErrorCode.routineDeleteHasRunningRun, ["id"]);

    await this.eventService.publish(DomainEvent.ROUTINE_DELETED, {
      entityId: deleted.id,
      payload: deleted,
    });

    return { ok: true as const, data: data.id };
  }
}
