import type { UserRoleDto } from "./get-roles.interactor";
import type { EventService } from "@/features/event/event.service";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { DomainEvent } from "@/features/event/domain-events";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
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

@TenantInteractor({ resource: Resource.users, action: Action.delete })
export class DeleteRoleInteractor extends AuthenticatedInteractor<DeleteRoleData, string> {
  constructor(
    private repo: DeleteRoleRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Enforce(Schema)
  @ValidateOutput(z.string())
  @Transaction
  async invoke(data: DeleteRoleData): Promise<{ ok: true; data: string }> {
    if (await this.repo.isSystemRole(data.id)) throw new Error("Cannot delete system roles");
    if (await this.repo.hasUsersAssigned(data.id)) throw new Error("Cannot delete role that is assigned to users");

    const role = await this.repo.deleteRoleOrThrow(data.id);

    await Promise.all([
      this.eventService.publish(DomainEvent.ROLE_DELETED, {
        entityId: role.id,
        payload: role,
      }),
    ]);

    return { ok: true as const, data: data.id };
  }
}
