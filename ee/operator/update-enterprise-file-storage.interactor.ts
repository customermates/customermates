import type { OperatorRepo } from "./operator.repo";
import type { EnterpriseFileStorageDto, UpdateEnterpriseFileStorageData } from "./operator.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { failConflict, failNotFound, failUnavailable } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { EnterpriseFileStorageDtoSchema, UpdateEnterpriseFileStorageSchema } from "./operator.schema";

@OperatorInteractor
export class UpdateEnterpriseFileStorageInteractor {
  constructor(private readonly repo: OperatorRepo) {}

  @Enforce(UpdateEnterpriseFileStorageSchema)
  @ValidateOutput(EnterpriseFileStorageDtoSchema)
  async invoke(data: UpdateEnterpriseFileStorageData): Validated<EnterpriseFileStorageDto> {
    const result = await this.repo.updateEnterpriseFileStorageUnscoped(data);

    if (result === "conflict") return failConflict(CustomErrorCode.operatorConflict);
    if (result === "notFound") return failNotFound(CustomErrorCode.userNotFound);
    if (result === "unavailable") return failUnavailable(CustomErrorCode.operatorUnavailable);
    if (typeof result === "string") return failConflict(CustomErrorCode.operatorConflict);

    return { ok: true, data: result };
  }
}
