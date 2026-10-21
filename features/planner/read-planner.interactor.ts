import type {
  GetRecordPresentationInteractor,
  RecordPresentationResult,
} from "@/features/records/get-record-presentation.interactor";
import type { PlannerPersonalEvents, PersonalCalendarEvent } from "./planner.repo";
import type { PlannerQuery, PlannerSource } from "./planner.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ViewMode } from "@/core/base/base-query-builder";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { PlannerQuerySchema } from "./planner.schema";

export type PlannerSourceData =
  | { source: PlannerSource; status: "ready"; presentation: RecordPresentationResult }
  | { source: PlannerSource; status: "unavailable" };
export type PlannerResult = {
  sources: PlannerSourceData[];
  events: PersonalCalendarEvent[];
  personalTruncated: boolean;
};

@AllowInDemoMode
@TenantInteractor()
export class ReadPlannerInteractor extends AuthenticatedInteractor<PlannerQuery, PlannerResult> {
  constructor(
    private records: GetRecordPresentationInteractor,
    private personal: PlannerPersonalEvents,
  ) {
    super();
  }
  @Validate(PlannerQuerySchema)
  async invoke({ config, window }: PlannerQuery): Validated<PlannerResult> {
    const sources: PlannerSourceData[] = [];
    for (const source of config.sources.filter((source) => source.enabled)) {
      const result = await this.records.invoke({
        typeId: source.typeId,
        transient: true,
        params: {
          viewId: ALL_VIEW_KEY,
          viewMode: ViewMode.calendar,
          calendar: source.calendar,
          calendarWindow: { ...window, timeZone: config.timeZone },
          filters: source.filters,
          searchTerm: source.search,
          grouping: null,
          page: 1,
          pageSize: 100,
        },
      });
      sources.push(
        result.ok &&
          result.data.result.calendarRange &&
          JSON.stringify(result.data.result.filters ?? []) === JSON.stringify(source.filters)
          ? { source, status: "ready", presentation: result.data }
          : { source, status: "unavailable" },
      );
    }
    const personal = await this.personal.events(config.calendarIds, { ...window, timeZone: config.timeZone });
    return { ok: true, data: { sources, events: personal.events, personalTruncated: personal.truncated } };
  }
}
