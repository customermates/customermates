import type { RolePermissionsDto as RoleDto } from "./role.schema";
import type { RoleManagementService } from "./role-management.service";
import type { UpsertRoleData, RoleMutationResult } from "./role-management.schema";
import type { Validated } from "@/core/validation/validation.utils";
import { UpsertRoleSchema, RoleMutationResultSchema } from "./role-management.schema";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

export type { UpsertRoleData } from "./role-management.schema";

export abstract class UpsertRoleRepo {
  abstract isSystemRoleOrThrow(id: string): Promise<boolean>;
  abstract upsertRoleOrThrow(data: UpsertRoleData): Promise<RoleDto>;
  abstract getRoleByIdOrThrow(id: string): Promise<RoleDto>;
  abstract findRoleById(id: string): Promise<RoleDto | null>;
}

@TenantInteractor()
export class UpsertRoleInteractor extends AuthenticatedInteractor<UpsertRoleData, RoleMutationResult> {
  constructor(private roles: RoleManagementService) {
    super();
  }

  @Validate(UpsertRoleSchema)
  @ValidateOutput(RoleMutationResultSchema)
  invoke(data: UpsertRoleData): Validated<RoleMutationResult> {
    return this.roles.upsert(data);
  }
}
