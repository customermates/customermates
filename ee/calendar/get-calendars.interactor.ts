import type { GetResult } from "@/core/base/base-get.interactor";
import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import type { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";
import type { Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { Resource, Action } from "@/generated/prisma";

import { type CalendarDto, CalendarDtoSchema } from "./calendar.schema";

import { BaseGetRepo } from "@/core/base/base-get.interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { BaseGetInteractor } from "@/core/base/base-get.interactor";
import { GetQueryParamsSchema, type GetQueryParams, createGetResultSchema } from "@/core/base/base-get.schema";
import { Validate } from "@/core/decorators/validate.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export abstract class GetCalendarsRepo extends BaseGetRepo<CalendarDto> {}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetCalendarsInteractor extends BaseGetInteractor<CalendarDto> {
  constructor(
    repo: GetCalendarsRepo,
    viewStateRepo: DataViewStateRepo,
    mode: "interactive" | "api",
    queryParamsPrecheck: QueryParamsPrecheckInteractor,
    private entitlements: EntitlementService,
  ) {
    super(
      repo,
      viewStateRepo,
      mode,
      undefined,
      { sortDescriptor: { field: "name", direction: "asc" } },
      queryParamsPrecheck,
    );
  }

  @Validate(GetQueryParamsSchema)
  @ValidateOutput(createGetResultSchema(CalendarDtoSchema))
  async invoke(params: GetQueryParams = {}): Validated<GetResult<CalendarDto>> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    return await super.invoke(params);
  }
}
