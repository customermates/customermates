import type { UserRoleDto } from "./get-roles.interactor";
import type { EventService } from "@/features/event/event.service";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { DomainEvent } from "@/features/event/domain-events";
import { RoleDtoSchema } from "./role.schema";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { type Validated } from "@/core/validation/validation.utils";
import { calculateChanges } from "@/core/utils/calculate-changes";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

const Schema = z.object({
  id: z.uuid().optional(),
  name: z.string().min(1, "Name must be at least 1 character"),
  description: z.string().min(1, "Description must be at least 1 character"),
  permissions: z.object({
    contacts: z.object({
      canManage: z.enum(["yes", "no"]),
      readAccess: z.enum(["none", "own", "all"]),
    }),
    deals: z.object({
      canManage: z.enum(["yes", "no"]),
      readAccess: z.enum(["none", "own", "all"]),
    }),
    organizations: z.object({
      canManage: z.enum(["yes", "no"]),
      readAccess: z.enum(["none", "own", "all"]),
    }),
    services: z.object({
      canManage: z.enum(["yes", "no"]),
      readAccess: z.enum(["none", "own", "all"]),
    }),
    users: z.object({
      canManage: z.enum(["yes", "no"]),
      readAccess: z.enum(["own", "all"]),
    }),
    company: z.object({
      canManage: z.enum(["yes", "no"]),
    }),
    api: z.object({
      canManage: z.enum(["yes", "no"]),
      readAccess: z.enum(["none", "all"]),
    }),
    tasks: z.object({
      canManage: z.enum(["yes", "no"]),
      readAccess: z.enum(["none", "own", "all"]),
    }),
    auditLog: z.object({
      readAccess: z.enum(["none", "all"]),
    }),
  }),
});
export type UpsertRoleData = Data<typeof Schema>;

export abstract class UpsertRoleRepo {
  abstract isSystemRole(id: string): Promise<boolean>;
  abstract upsertRoleOrThrow(data: UpsertRoleData): Promise<UserRoleDto>;
  abstract getRoleByIdOrThrow(id: string): Promise<UserRoleDto>;
}

@TenantInteractor({
  permissions: [
    { resource: Resource.users, action: Action.create },
    { resource: Resource.users, action: Action.update },
  ],
  condition: "AND",
})
export class UpsertRoleInteractor extends AuthenticatedInteractor<UpsertRoleData, UserRoleDto> {
  constructor(
    private repo: UpsertRoleRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(RoleDtoSchema)
  @Transaction
  async invoke(data: UpsertRoleData): Validated<UserRoleDto> {
    if (data.id && (await this.repo.isSystemRole(data.id))) throw new Error("Cannot update system roles");

    const previousRole = data.id ? await this.repo.getRoleByIdOrThrow(data.id) : undefined;
    const role = await this.repo.upsertRoleOrThrow(data);

    const eventPromise =
      data.id && previousRole
        ? this.eventService.publish(DomainEvent.ROLE_UPDATED, {
            entityId: role.id,
            payload: {
              role,
              changes: calculateChanges(previousRole, role),
            },
          })
        : this.eventService.publish(DomainEvent.ROLE_CREATED, {
            entityId: role.id,
            payload: role,
          });

    await Promise.all([eventPromise]);

    return { ok: true as const, data: role };
  }
}
