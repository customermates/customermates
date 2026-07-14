import type { GetResult, P13nRepo } from "@/core/base/base-get.interactor";
import type { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";
import type { Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { Resource, Action } from "@/generated/prisma";

import { type CalendarEventDto, CalendarEventDtoSchema } from "./calendar.schema";

import { BaseGetRepo } from "@/core/base/base-get.interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { BaseGetInteractor } from "@/core/base/base-get.interactor";
import { GetQueryParamsSchema, type GetQueryParams, createGetResultSchema } from "@/core/base/base-get.schema";
import { Validate } from "@/core/decorators/validate.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export abstract class GetCalendarEventsRepo extends BaseGetRepo<CalendarEventDto> {}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.inboxMessages, action: Action.readAll },
    { resource: Resource.inboxMessages, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetCalendarEventsInteractor extends BaseGetInteractor<CalendarEventDto> {
  constructor(
    repo: GetCalendarEventsRepo,
    p13nRepo: P13nRepo,
    mode: "interactive" | "api",
    queryParamsPrecheck: QueryParamsPrecheckInteractor,
    private entitlements: EntitlementService,
  ) {
    super(
      repo,
      p13nRepo,
      mode,
      undefined,
      { sortDescriptor: { field: "startsAt", direction: "asc" } },
      queryParamsPrecheck,
    );
  }

  @Validate(GetQueryParamsSchema)
  @ValidateOutput(createGetResultSchema(CalendarEventDtoSchema))
  async invoke(params: GetQueryParams = {}): Validated<GetResult<CalendarEventDto>> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    return await super.invoke(params);
  }
}
