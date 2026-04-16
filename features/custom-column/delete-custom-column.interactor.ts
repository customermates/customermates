import type { UserService } from "../user/user.service";
import type { WidgetService } from "../widget/widget.service";
import type { EventService } from "@/features/event/event.service";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Action, EntityType, Resource } from "@/generated/prisma";

import { type CustomColumnDto } from "./custom-column.schema";

import { DomainEvent } from "@/features/event/domain-events";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { BaseInteractor } from "@/core/base/base-interactor";

const Schema = z.object({
  id: z.uuid(),
});
export type DeleteCustomColumnData = Data<typeof Schema>;

export abstract class DeleteCustomColumnRepo {
  abstract find(id: string): Promise<CustomColumnDto>;
  abstract delete(id: string): Promise<{ id: string }>;
}

@TentantInteractor()
export class DeleteCustomColumnInteractor extends BaseInteractor<DeleteCustomColumnData, string> {
  constructor(
    private repo: DeleteCustomColumnRepo,
    private userService: UserService,
    private widgetService: WidgetService,
    private eventService: EventService,
  ) {
    super();
  }

  @Enforce(Schema)
  @ValidateOutput(z.string())
  @Transaction
  async invoke(data: DeleteCustomColumnData): Promise<{ ok: true; data: string }> {
    const customColumn = await this.repo.find(data.id);

    const entityTypePermissionMap: Record<EntityType, { resource: Resource; action: Action }> = {
      [EntityType.contact]: { resource: Resource.contacts, action: Action.delete },
      [EntityType.organization]: { resource: Resource.organizations, action: Action.delete },
      [EntityType.deal]: { resource: Resource.deals, action: Action.delete },
      [EntityType.service]: { resource: Resource.services, action: Action.delete },
      [EntityType.task]: { resource: Resource.tasks, action: Action.delete },
    };

    const permission = entityTypePermissionMap[customColumn.entityType];

    if (!permission) throw new Error("You are not allowed to delete this custom column");

    await this.userService.hasPermissionOrThrow(permission.resource, permission.action);

    await Promise.all([
      this.repo.delete(data.id),
      this.widgetService.recalculateUserWidgets(),
      this.eventService.publish(DomainEvent.CUSTOM_COLUMN_DELETED, {
        entityId: customColumn.id,
        payload: customColumn,
      }),
    ]);

    return { ok: true as const, data: data.id };
  }
}
