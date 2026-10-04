import type { RoleManagementService } from "./role-management.service";
import type { UpsertRoleData, RoleMutationResult } from "./role-management.schema";
import type { Validated } from "@/core/validation/validation.utils";
import { UpsertRoleSchema, RoleMutationResultSchema } from "./role-management.schema";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

export type { UpsertRoleData } from "./role-management.schema";

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
