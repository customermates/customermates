import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { OperatorWorkspaceRowDto } from "../operator-lists.schema";

import { BaseGetInteractor, BaseGetRepo } from "@/core/base/base-get.interactor";
import { GetQueryParamsSchema, createGetResultSchema } from "@/core/base/base-get.schema";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { OperatorInteractor } from "@/core/decorators/operator-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import { OperatorWorkspaceRowDtoSchema } from "../operator-lists.schema";

export abstract class GetOperatorWorkspacesRepo extends BaseGetRepo<OperatorWorkspaceRowDto> {}

@OperatorInteractor
export class GetOperatorWorkspacesInteractor extends BaseGetInteractor<OperatorWorkspaceRowDto> {
  constructor(repo: GetOperatorWorkspacesRepo, viewStateRepo: DataViewStateRepo) {
    super(repo, viewStateRepo, "interactive", undefined, {
      sortDescriptor: { field: "createdAt", direction: "desc" },
      pagination: { pageSize: 25, page: 1 },
    });
  }

  @Enforce(GetQueryParamsSchema)
  @ValidateOutput(createGetResultSchema(OperatorWorkspaceRowDtoSchema))
  async invoke(params: GetQueryParams = {}) {
    return await super.invoke(params);
  }
}
