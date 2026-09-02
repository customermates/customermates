import type { OperatorRepo } from "./operator.repo";
import type { UpdateHostedAiEnterpriseAllowanceData, HostedAiOperatorCompanyDto } from "./operator.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { failConflict, failNotFound, failUnavailable } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { HostedAiOperatorCompanyDtoSchema, UpdateHostedAiEnterpriseAllowanceSchema } from "./operator.schema";

@OperatorInteractor
export class UpdateHostedAiEnterpriseAllowanceInteractor {
  constructor(private readonly repo: OperatorRepo) {}

  @Enforce(UpdateHostedAiEnterpriseAllowanceSchema)
  @ValidateOutput(HostedAiOperatorCompanyDtoSchema)
  async invoke(data: UpdateHostedAiEnterpriseAllowanceData): Validated<HostedAiOperatorCompanyDto> {
    const result = await this.repo.updateEnterpriseAllowanceUnscoped(data);

    if (result === "connectedAccountsActive") return failConflict(CustomErrorCode.operatorConnectedAccountsActive);
    if (result === "allowanceMissing") return failConflict(CustomErrorCode.operatorAllowanceMissing);
    if (result === "trialEndRequired") return failConflict(CustomErrorCode.operatorTrialEndRequired);
    if (result === "conflict") return failConflict(CustomErrorCode.operatorConflict);
    if (result === "notFound") return failNotFound(CustomErrorCode.userNotFound);
    if (result === "unavailable") return failUnavailable(CustomErrorCode.operatorUnavailable);

    return { ok: true, data: result };
  }
}
