import type { z } from "zod";
import type { Validated } from "@/core/validation/validation.utils";
import type { RoleManagementService } from "./role-management.service";
import type { RoleEditorContext } from "./role-management.schema";
import { GetRoleEditorSchema, RoleEditorContextSchema } from "./role-management.schema";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

@AllowInDemoMode
@TenantInteractor()
export class GetRoleEditorInteractor extends AuthenticatedInteractor<
  z.infer<typeof GetRoleEditorSchema>,
  RoleEditorContext
> {
  constructor(private roles: RoleManagementService) {
    super();
  }

  @Validate(GetRoleEditorSchema)
  @ValidateOutput(RoleEditorContextSchema)
  invoke(input: z.infer<typeof GetRoleEditorSchema>): Validated<RoleEditorContext> {
    return this.roles.read(input.id, input.typeIds);
  }
}
