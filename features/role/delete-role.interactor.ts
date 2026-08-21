import type { RoleDto } from "./role.schema";
import type { EventService } from "@/features/event/event.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { DomainEvent } from "@/features/event/domain-events";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { createInteractorFailure } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

const Schema = z.object({
  id: z.uuid(),
});
export type DeleteRoleData = Data<typeof Schema>;

export abstract class DeleteRoleRepo {
  abstract isSystemRoleOrThrow(id: string): Promise<boolean>;
  abstract hasUsersAssigned(data: string): Promise<boolean>;
  abstract deleteRoleOrThrow(id: string): Promise<RoleDto>;
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
  @Transaction
  @ValidateOutput(z.string())
  async invoke(data: DeleteRoleData): Validated<string> {
    if (await this.repo.isSystemRoleOrThrow(data.id))
      return createInteractorFailure(CustomErrorCode.roleSystemImmutable, ["id"]);
    if (await this.repo.hasUsersAssigned(data.id))
      return createInteractorFailure(CustomErrorCode.roleAssignedCannotDelete, ["id"]);

    const role = await this.repo.deleteRoleOrThrow(data.id);

    await this.eventService.publish(DomainEvent.ROLE_DELETED, {
      entityId: role.id,
      payload: role,
    });

    return { ok: true as const, data: data.id };
  }
}
