import type { P13nRepo } from "@/core/base/base-get.interactor";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { OperatorAuditRowDto } from "../operator-lists.schema";

import { BaseGetInteractor, BaseGetRepo } from "@/core/base/base-get.interactor";
import { GetQueryParamsSchema, createGetResultSchema } from "@/core/base/base-get.schema";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import { OperatorAuditRowDtoSchema } from "../operator-lists.schema";

export abstract class GetOperatorAuditLogsRepo extends BaseGetRepo<OperatorAuditRowDto> {}

@OperatorInteractor
export class GetOperatorAuditLogsInteractor extends BaseGetInteractor<OperatorAuditRowDto> {
  constructor(repo: GetOperatorAuditLogsRepo, p13nRepo: P13nRepo) {
    super(repo, p13nRepo, "interactive", undefined, {
      sortDescriptor: { field: "createdAt", direction: "desc" },
      pagination: { pageSize: 25, page: 1 },
    });
  }

  @Enforce(GetQueryParamsSchema)
  @ValidateOutput(createGetResultSchema(OperatorAuditRowDtoSchema))
  async invoke(params: GetQueryParams = {}) {
    return await super.invoke(params);
  }
}
