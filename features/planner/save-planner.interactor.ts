import type { Validated } from "@/core/validation/validation.utils";
import type { UpsertP13nInteractor } from "@/features/p13n/upsert-p13n.interactor";
import type { RecordViewPolicy } from "@/features/records/record-view-policy";
import type { GetPlannerOptionsInteractor, PlannerOptions } from "./get-planner-options.interactor";
import type { PersonalCalendar } from "./planner.repo";
import type { SavePlannerInput } from "./planner.schema";

import { randomUUID } from "node:crypto";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { recordSurfaceKey } from "@/core/data-view/data-view-keys";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { Validate } from "@/core/decorators/validate.decorator";
import { fail, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { PLANNER_P13N_ID, SavePlannerSchema } from "./planner.schema";

@TenantInteractor()
export class SavePlannerInteractor extends AuthenticatedInteractor<
  SavePlannerInput,
  Pick<PlannerOptions, "config" | "saved">
> {
  constructor(
    private options: GetPlannerOptionsInteractor,
    private views: RecordViewPolicy,
    private personalization: UpsertP13nInteractor,
  ) {
    super();
  }

  @Validate(SavePlannerSchema)
  async invoke({ config }: SavePlannerInput): Validated<Pick<PlannerOptions, "config" | "saved">> {
    return runInTransaction(async () => {
      let settings = null;
      if (config) {
        const current = await this.options.invoke();
        if (!current.ok) return current;
        const invalid = await this.invalid(config, current.data.calendars);
        if (invalid) return invalid;
        const previous = current.data.config;
        settings = {
          sources: (config.sources ?? previous.sources).map((source) => ({ ...source, id: source.id ?? randomUUID() })),
          calendarIds: config.calendarIds ?? previous.calendarIds,
          timeZone: config.timeZone ?? previous.timeZone,
          mode: config.mode ?? previous.mode,
        };
      }
      const saved = await this.personalization.invoke({ p13nId: PLANNER_P13N_ID, settings });
      if (!saved.ok) return saved;
      const result = await this.options.invoke();
      if (!result.ok) return result;
      return { ok: true as const, data: { config: result.data.config, saved: result.data.saved } };
    });
  }

  private async invalid(config: NonNullable<SavePlannerInput["config"]>, calendars: PersonalCalendar[]) {
    for (const [index, source] of (config.sources ?? []).entries()) {
      const surfaceKey = recordSurfaceKey(source.typeId);
      if (!(await this.views.describe(surfaceKey)))
        return failNotFound(CustomErrorCode.recordTypeNotFound, ["config", "sources", index, "typeId"]);
      const calendar = await this.views.invalidCalendar(surfaceKey, source.calendar);
      if (calendar) {
        return fail(CustomErrorCode.invalidFilterField, ["config", "sources", index, "calendar", calendar.key], {
          validValues: calendar.validValues.join(", "),
        });
      }
      const filter = await this.views.invalidFilter(surfaceKey, source.filters);
      if (filter) return fail(filter.code, ["config", "sources", index, "filters", filter.index], filter.values);
    }
    const unknown = (config.calendarIds ?? []).findIndex((id) => !calendars.some((calendar) => calendar.id === id));
    if (unknown >= 0) return failNotFound(CustomErrorCode.calendarNotFound, ["config", "calendarIds", unknown]);
    return null;
  }
}
