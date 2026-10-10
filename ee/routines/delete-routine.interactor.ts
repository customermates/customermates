import type { Data, Validated } from "@/core/validation/validation.utils";
import type { EventService } from "@/features/event/event.service";
import type { TrashRepo } from "@/features/trash/trash.repo";

import { randomUUID } from "node:crypto";

import { Resource } from "@/generated/prisma";

import { z } from "zod";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { failAuthorization, failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import type { DeleteRoutineRepo } from "./delete-routine.repo";

const Schema = z.object({ id: z.uuid() });
const ResultSchema = z.object({ id: z.uuid(), trashBatchId: z.uuid() });

export type DeleteRoutineData = Data<typeof Schema>;
export type DeleteRoutineResult = Data<typeof ResultSchema>;

@TenantInteractor({ resource: Resource.routines, manage: "delete" })
export class DeleteRoutineInteractor extends AuthenticatedInteractor<DeleteRoutineData, DeleteRoutineResult> {
  constructor(
    private repo: DeleteRoutineRepo,
    private eventService: EventService,
    private trash: TrashRepo,
  ) {
    super();
  }

  @Write({ input: Schema, output: ResultSchema })
  async invoke(data: DeleteRoutineData): Validated<DeleteRoutineResult> {
    if (!this.user.role?.isSystemRole || !(await this.repo.isActiveSystemAdministrator(this.user.id)))
      return failAuthorization(CustomErrorCode.routineAdminRequired);

    const deleted = await this.repo.trashRoutineOrThrow(data.id, new Date());
    if (!deleted) return failConflict(CustomErrorCode.routineDeleteHasRunningRun, ["id"]);

    const trashBatchId = randomUUID();
    await this.trash.add([
      {
        id: randomUUID(),
        kind: "routine",
        targetId: deleted.id,
        typeId: null,
        ownerUserId: deleted.ownerUserId,
        label: deleted.name,
        deletedById: this.user.id,
        batchId: trashBatchId,
      },
    ]);

    await this.eventService.publish(DomainEvent.ROUTINE_DELETED, {
      entityId: deleted.id,
      payload: deleted,
    });

    return { ok: true as const, data: { id: data.id, trashBatchId } };
  }
}
