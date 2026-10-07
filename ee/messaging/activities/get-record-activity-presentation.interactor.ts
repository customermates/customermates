import { z } from "zod";
import type { Validated } from "@/core/validation/validation.utils";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { ActivityEntryDto } from "./activities.schema";
import type { DataViewStateRepo } from "@/core/data-view/data-view-state.repo";
import type { RecordViewPolicy } from "@/features/records/record-view-policy";
import type { GetRecordActivitiesInteractor } from "./get-record-activities.interactor";
import type { RecordActivitiesResult } from "./record-activities.schema";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { GetQueryParamsSchema } from "@/core/base/base-get.schema";
import { RecordRefSchema } from "@/features/records/record-model.schema";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { SURFACE, ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { resolveDataViewState } from "@/core/data-view/resolve-data-view-state";
import { failNotFound, fail } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { ACTIVITY_KINDS, CHANGE_ACTIVITY_KINDS } from "./activities.schema";
import { activityViewColumns, activityViewFilterableFields, activityViewFilters } from "./record-activity-view";
import type { ColumnPresentation } from "@/core/data-view/column-presentation.schema";

const Input = z.object({ record: RecordRefSchema.nullable(), params: GetQueryParamsSchema.default({}) }).strict();
export type RecordActivityPresentationInput = z.infer<typeof Input>;
export type RecordActivityPresentation = GetResult<ActivityEntryDto> &
  RecordActivitiesResult & { columns: ColumnPresentation[] };

@AllowInDemoMode
@TenantInteractor()
export class GetRecordActivityPresentationInteractor extends AuthenticatedInteractor<
  RecordActivityPresentationInput,
  RecordActivityPresentation
> {
  constructor(
    private views: DataViewStateRepo,
    private policy: RecordViewPolicy,
    private activities: GetRecordActivitiesInteractor,
  ) {
    super();
  }
  @Validate(Input)
  async invoke({ record, params }: RecordActivityPresentationInput): Validated<RecordActivityPresentation> {
    return runInTransaction(
      async () => {
        const surface = record ? SURFACE.entityTimeline : SURFACE.activity;
        const kinds = record ? ACTIVITY_KINDS : CHANGE_ACTIVITY_KINDS;
        const persisted = await this.views.loadSurfaceState(surface);
        const viewKey = params.viewId ?? persisted.activeViewKey ?? ALL_VIEW_KEY;
        const selected = persisted.views.find((view) => view.id === viewKey);
        if (viewKey !== ALL_VIEW_KEY && !selected) return failNotFound(CustomErrorCode.dataViewNotFound);
        const state = resolveDataViewState({
          params: { filters: params.filters },
          base: selected?.state ?? persisted.allState,
        });
        const invalid = await this.policy.validate(surface, state);
        if (invalid) return fail(invalid);
        const result = await this.activities.invoke({
          scope: { records: record ? [record] : [], typeIds: [] },
          kinds: [...kinds],
          filters: activityViewFilters(state.filters),
          cursor: null,
          limit: 25,
        });
        if (!result.ok) return result;
        const types = await this.policy.list();
        return {
          ok: true,
          data: {
            ...result.data,
            ...state,
            grouping: undefined,
            p13nId: surface,
            views: persisted.views,
            activeViewKey: viewKey,
            allState: persisted.allState,
            columns: activityViewColumns(types),
            filterableFields: activityViewFilterableFields(types, kinds),
            viewPersistable: true,
          },
        };
      },
      { readOnly: true },
    );
  }
}
