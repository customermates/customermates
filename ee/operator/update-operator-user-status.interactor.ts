import type { OperatorRepo } from "./operator.repo";
import type { OperatorUserDetailDto, UpdateOperatorUserStatusData } from "./operator.schema";
import type { Validated } from "@/core/validation/validation.utils";
import type { ReleaseOwnerRoutinesInteractor } from "@/ee/routines/release-owner-routines.interactor";

import { Status } from "@/generated/prisma";

import { failConflict, failNotFound, failUnavailable } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { OperatorUserDetailDtoSchema, UpdateOperatorUserStatusSchema } from "./operator.schema";

@OperatorInteractor
export class UpdateOperatorUserStatusInteractor {
  constructor(
    private readonly repo: OperatorRepo,
    private readonly releaseOwnerRoutines: ReleaseOwnerRoutinesInteractor,
  ) {}

  @Enforce(UpdateOperatorUserStatusSchema)
  @ValidateOutput(OperatorUserDetailDtoSchema)
  async invoke(data: UpdateOperatorUserStatusData): Validated<OperatorUserDetailDto> {
    const result = await this.repo.updateUserStatusUnscoped(data);

    if (result === "connectedAccountsActive") return failConflict(CustomErrorCode.operatorConnectedAccountsActive);
    if (result === "allowanceMissing") return failConflict(CustomErrorCode.operatorAllowanceMissing);
    if (result === "trialEndRequired") return failConflict(CustomErrorCode.operatorTrialEndRequired);
    if (result === "conflict") return failConflict(CustomErrorCode.operatorConflict);
    if (result === "notFound") return failNotFound(CustomErrorCode.userNotFound);
    if (result === "unavailable") return failUnavailable(CustomErrorCode.operatorUnavailable);

    if (result.status !== Status.active)
      await this.releaseOwnerRoutines.invoke({ companyId: result.companyId, ownerUserId: data.userId });

    return { ok: true, data: result };
  }
}
