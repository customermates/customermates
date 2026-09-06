import type { UserService } from "../user/user.service";
import type { EventService } from "@/features/event/event.service";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { ValidateCustomColumnIdsInteractor } from "@/core/validation/validators/validate-custom-column-ids.interactor";

import { z } from "zod";
import { Action, EntityType, Resource } from "@/generated/prisma";

import { type CustomColumnDto } from "./custom-column.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { BULK_WRITE_TRANSACTION } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

const Schema = z.object({
  id: z.uuid(),
});
type DeleteCustomColumnData = Data<typeof Schema>;

export abstract class DeleteCustomColumnRepo {
  abstract findByIdOrThrow(id: string): Promise<CustomColumnDto>;
  abstract delete(id: string): Promise<{ id: string }>;
}

export abstract class DeleteCustomColumnRoutineRepo {
  abstract hasRoutineFilterReference(field: string): Promise<boolean>;
}

@TenantInteractor()
export class DeleteCustomColumnInteractor extends AuthenticatedInteractor<DeleteCustomColumnData, string> {
  constructor(
    private repo: DeleteCustomColumnRepo,
    private routineRepo: DeleteCustomColumnRoutineRepo,
    private userService: UserService,
    private eventService: EventService,
    private validator: ValidateCustomColumnIdsInteractor,
  ) {
    super();
  }

  @Write({
    input: Schema,
    output: z.string(),
    tx: BULK_WRITE_TRANSACTION,
    precheck: (self, data, ctx) => self.validator.invoke([{ ids: data.id, path: ["id"] }], ctx),
  })
  async invoke(data: DeleteCustomColumnData): Validated<string> {
    const customColumn = await this.repo.findByIdOrThrow(data.id);

    const entityTypePermissionMap: Record<EntityType, { resource: Resource; action: Action }> = {
      [EntityType.contact]: {
        resource: Resource.contacts,
        action: Action.delete,
      },
      [EntityType.organization]: {
        resource: Resource.organizations,
        action: Action.delete,
      },
      [EntityType.deal]: { resource: Resource.deals, action: Action.delete },
      [EntityType.service]: {
        resource: Resource.services,
        action: Action.delete,
      },
      [EntityType.task]: { resource: Resource.tasks, action: Action.delete },
    };

    const permission = entityTypePermissionMap[customColumn.entityType];

    await this.userService.hasPermissionOrThrow(permission.resource, permission.action);

    if (await this.routineRepo.hasRoutineFilterReference(customColumn.id))
      return failConflict(CustomErrorCode.customColumnUsedByRoutineCannotDelete, ["id"]);

    await Promise.all([
      this.repo.delete(data.id),
      this.eventService.publish(DomainEvent.CUSTOM_COLUMN_DELETED, {
        entityId: customColumn.id,
        payload: customColumn,
      }),
    ]);

    return { ok: true as const, data: data.id };
  }
}
