import type { OperatorRepo } from "./operator.repo";
import type { DeleteOperatorWorkspaceData, DeleteOperatorWorkspaceResultDto } from "./operator.schema";
import type { Validated } from "@/core/validation/validation.utils";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";

import { failConflict, failNotFound, failUnavailable } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { DeleteOperatorWorkspaceResultDtoSchema, DeleteOperatorWorkspaceSchema } from "./operator.schema";

@OperatorInteractor
export class DeleteOperatorWorkspaceInteractor {
  constructor(
    private readonly repo: OperatorRepo,
    private readonly background: Pick<BackgroundTaskService, "dispatch">,
  ) {}

  @Enforce(DeleteOperatorWorkspaceSchema)
  @ValidateOutput(DeleteOperatorWorkspaceResultDtoSchema)
  async invoke(data: DeleteOperatorWorkspaceData): Validated<DeleteOperatorWorkspaceResultDto> {
    const result = await this.repo.deleteWorkspaceUnscoped(data);

    if (result === "connectedAccountsActive") return failConflict(CustomErrorCode.operatorConnectedAccountsActive);
    if (result === "allowanceMissing") return failConflict(CustomErrorCode.operatorAllowanceMissing);
    if (result === "trialEndRequired") return failConflict(CustomErrorCode.operatorTrialEndRequired);
    if (result === "conflict") return failConflict(CustomErrorCode.operatorConflict);
    if (result === "notFound") return failNotFound(CustomErrorCode.userNotFound);
    if (result === "unavailable") return failUnavailable(CustomErrorCode.operatorUnavailable);

    await this.background.dispatch("purge-company-files", { companyId: data.companyId });
    return { ok: true, data: result };
  }
}
