import { z } from "zod";
import type { RolePermissionsDto as RoleDto } from "./role.schema";
import type { RoleManagementService } from "./role-management.service";
import type { DeleteRoleData } from "./role-management.schema";
import type { Validated } from "@/core/validation/validation.utils";
import { DeleteRoleSchema } from "./role-management.schema";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export type { DeleteRoleData } from "./role-management.schema";
export abstract class DeleteRoleRepo {
  abstract isSystemRoleOrThrow(id: string): Promise<boolean>;
  abstract hasUsersAssigned(id: string): Promise<boolean>;
  abstract deleteRoleOrThrow(id: string): Promise<RoleDto>;
}

@TenantInteractor()
export class DeleteRoleInteractor extends AuthenticatedInteractor<DeleteRoleData, string> {
  constructor(private roles: RoleManagementService) {
    super();
  }

  @Validate(DeleteRoleSchema)
  @ValidateOutput(z.string())
  invoke(data: DeleteRoleData): Validated<string> {
    return this.roles.delete(data);
  }
}
