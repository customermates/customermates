import type {
  GetRecordPresentationInteractor,
  RecordPresentationResult,
} from "@/features/records/get-record-presentation.interactor";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { PlannerPersonalEvents, PersonalCalendarEvent } from "./planner.repo";
import type { PlannerQuery, PlannerSource } from "./planner.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { Resource } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { roleCanRead } from "@/core/base/permission.service";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ViewMode } from "@/core/base/base-query-builder";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { canonicalRecordJson } from "@/features/records/record-json";
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
    private entitlements: Pick<EntitlementService, "require">,
  ) {
    super();
  }
  @Validate(PlannerQuerySchema)
  async invoke({ config, window }: PlannerQuery): Validated<PlannerResult> {
    const calendarWindow = { ...window, timeZone: config.timeZone };
    const sources = await Promise.all(
      config.sources
        .filter((source) => source.enabled)
        .map(async (source): Promise<PlannerSourceData> => {
          const result = await this.records.invoke({
            typeId: source.typeId,
            transient: true,
            params: {
              viewId: ALL_VIEW_KEY,
              viewMode: ViewMode.calendar,
              calendar: source.calendar,
              calendarWindow,
              filters: source.filters,
              grouping: null,
              page: 1,
              pageSize: 100,
            },
          });
          return result.ok &&
            result.data.result.calendarRange &&
            canonicalRecordJson(result.data.result.filters ?? []) === canonicalRecordJson(source.filters)
            ? { source, status: "ready", presentation: result.data }
            : { source, status: "unavailable" };
        }),
    );
    const personal =
      config.calendarIds.length &&
      roleCanRead(this.user.role, Resource.inboxMessages) &&
      !(await this.entitlements.require("messaging"))
        ? await this.personal.events(config.calendarIds, calendarWindow)
        : { events: [], truncated: false };
    return { ok: true, data: { sources, events: personal.events, personalTruncated: personal.truncated } };
  }
}
