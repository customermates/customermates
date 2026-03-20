import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { UserRoleDto } from "./get-roles.interactor";

import { DomainEvent } from "@/features/event/domain-events";
import { EventService } from "@/features/event/event.service";
import { WidgetService } from "@/features/widget/widget.service";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { Data } from "@/core/validation/validation.utils";
import { Transaction } from "@/core/decorators/transaction.decorator";

const Schema = z.object({
  id: z.uuid(),
});
export type DeleteRoleData = Data<typeof Schema>;

export abstract class DeleteRoleRepo {
  abstract isSystemRole(id: string): Promise<boolean>;
  abstract hasUsersAssigned(data: string): Promise<boolean>;
  abstract deleteRoleOrThrow(id: string): Promise<UserRoleDto>;
}

@TentantInteractor({ resource: Resource.users, action: Action.delete })
export class DeleteRoleInteractor {
  constructor(
    private repo: DeleteRoleRepo,
    private eventService: EventService,
    private widgetService: WidgetService,
  ) {}

  @Enforce(Schema)
  @Transaction
  async invoke(data: DeleteRoleData): Promise<void> {
    if (await this.repo.isSystemRole(data.id)) throw new Error("Cannot delete system roles");
    if (await this.repo.hasUsersAssigned(data.id)) throw new Error("Cannot delete role that is assigned to users");

    const role = await this.repo.deleteRoleOrThrow(data.id);

    await Promise.all([
      this.eventService.publish(DomainEvent.ROLE_DELETED, {
        entityId: role.id,
        payload: role,
      }),
      this.widgetService.recalculateUserWidgets(),
    ]);
  }
}
