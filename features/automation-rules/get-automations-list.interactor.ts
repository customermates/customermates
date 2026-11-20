import type { GetResult } from "@/core/base/base-get.interactor";
import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import type { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";
import type { Validated } from "@/core/validation/validation.utils";
import type { AutomationListItemDto, AutomationListNotShown } from "./automations-list.schema";
import type { AutomationsListComposer } from "./automations-list.composer";

import { Resource } from "@/generated/prisma";
import { BaseGetInteractor } from "@/core/base/base-get.interactor";
import { GetQueryParamsSchema, type GetQueryParams, createGetResultSchema } from "@/core/base/base-get.schema";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

import { AutomationListItemDtoSchema, AutomationListNotShownSchema } from "./automations-list.schema";

export type AutomationsListResult = GetResult<AutomationListItemDto> & { notShown: AutomationListNotShown };

@AllowInDemoMode
@TenantInteractor({ resource: Resource.routines, read: true })
export class GetAutomationsListInteractor extends BaseGetInteractor<AutomationListItemDto> {
  constructor(
    private readonly composer: AutomationsListComposer,
    viewStateRepo: DataViewStateRepo,
    mode: "interactive" | "api",
    queryParamsPrecheck: QueryParamsPrecheckInteractor,
  ) {
    super(
      composer,
      viewStateRepo,
      mode,
      { sortDescriptor: { field: "createdAt", direction: "desc" } },
      queryParamsPrecheck,
    );
  }

  @Validate(GetQueryParamsSchema)
  @ValidateOutput(createGetResultSchema(AutomationListItemDtoSchema).extend({ notShown: AutomationListNotShownSchema }))
  async invoke(params: GetQueryParams = {}): Validated<AutomationsListResult> {
    const result = await super.invoke(params);
    if (!result.ok) return result;
    return { ok: true as const, data: { ...result.data, notShown: await this.composer.notShown() } };
  }
}
