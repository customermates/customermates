import type { ActivityScope } from "./activity-scope.schema";
import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import type { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { BaseGetInteractor, BaseGetRepo } from "@/core/base/base-get.interactor";

import type { ActivityEntryDto, ActivitiesParams, ActivityKind } from "./activities.schema";
import { ActivitiesParamsSchema, ActivitiesViewResultSchema } from "./activities.schema";
import { ACTIVITY_MAX_PAGE } from "./activity-scope.schema";
import { activityFilterableFieldsRetainedForFailClosedCompilation } from "./activity-filterable-fields";

export abstract class GetActivitiesRepo extends BaseGetRepo<ActivityEntryDto> {
  abstract canReadMessagingSources(): boolean;
  abstract getAvailableSources(): ActivityKind[];
  abstract isScopeTruncated(): Promise<boolean>;
  abstract setMessagingSourcesEnabled(enabled: boolean): void;
  abstract setScope(scope?: ActivityScope): void;
}

@AllowInDemoMode
@TenantInteractor()
export class GetActivitiesInteractor extends BaseGetInteractor<ActivityEntryDto> {
  constructor(
    private activitiesRepo: GetActivitiesRepo,
    viewStateRepo: DataViewStateRepo,
    mode: "interactive" | "api",
    queryParamsPrecheck: QueryParamsPrecheckInteractor,
    private entitlements: EntitlementService,
  ) {
    super(
      activitiesRepo,
      viewStateRepo,
      mode,
      undefined,
      { sortDescriptor: { field: "at", direction: "desc" } },
      queryParamsPrecheck,
      activityFilterableFieldsRetainedForFailClosedCompilation(),
    );
  }

  @Validate(ActivitiesParamsSchema)
  @ValidateOutput(ActivitiesViewResultSchema)
  async invoke(params: ActivitiesParams = {}) {
    const canReadMessagingSources = this.activitiesRepo.canReadMessagingSources();
    const entitlementDenied = canReadMessagingSources ? await this.entitlements.require("messaging") : null;
    this.activitiesRepo.setMessagingSourcesEnabled(canReadMessagingSources && !entitlementDenied);
    this.activitiesRepo.setScope(params.scope);

    const result = await super.invoke(params);
    if (!result.ok) return result;

    const pagination = result.data.pagination;
    const pageLimitReached = Boolean(
      pagination && pagination.page >= ACTIVITY_MAX_PAGE && pagination.total > pagination.page * pagination.pageSize,
    );

    return {
      ok: true as const,
      data: {
        ...result.data,
        availableSources: this.activitiesRepo.getAvailableSources(),
        pageLimitReached,
        ...(pagination
          ? {
              pagination: {
                ...pagination,
                totalPages: Math.min(pagination.totalPages, ACTIVITY_MAX_PAGE),
              },
            }
          : {}),
        scopeTruncated: await this.activitiesRepo.isScopeTruncated(),
      },
    };
  }
}
