import type { Data, Validated } from "@/core/validation/validation.utils";
import type { AuthService } from "@/features/auth/auth.service";
import type { WorkspaceDeletionRepo } from "./workspace-deletion.repo";

import { z } from "zod";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failAuthorization, failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { env } from "@/env";
import { WORKSPACE_DELETE_REFUSALS, workspaceDeleteRefusal } from "./workspace-deletion-refusal";

const OutputSchema = z.object({
  companyId: z.string(),
  refusal: z.enum(WORKSPACE_DELETE_REFUSALS).nullable(),
});
export type WorkspaceDeletion = Data<typeof OutputSchema>;

@AllowInDemoMode
@TenantInteractor()
export class GetWorkspaceDeletionInteractor extends AuthenticatedInteractor<void, WorkspaceDeletion> {
  constructor(
    private readonly authService: AuthService,
    private readonly repo: WorkspaceDeletionRepo,
  ) {
    super();
  }

  @ValidateOutput(OutputSchema)
  async invoke(): Validated<WorkspaceDeletion> {
    const session = await this.authService.getInteractiveSession();
    if (!session) return failAuthorization(CustomErrorCode.permissionDenied);

    const subject = await this.repo.findDeletionSubjectUnscoped(this.companyId);
    if (!subject) return failConflict(CustomErrorCode.workspaceChanged, ["companyId"]);

    const refusal = workspaceDeleteRefusal({
      appMode: env.APP_MODE,
      login: { id: session.user.id, email: session.user.email },
      isAdmin: this.user.role?.isSystemRole === true,
      subject,
    });

    return { ok: true as const, data: { companyId: this.companyId, refusal } };
  }
}
