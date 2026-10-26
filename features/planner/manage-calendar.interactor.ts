import type { Validated } from "@/core/validation/validation.utils";
import type { UpsertP13nInteractor } from "@/features/p13n/upsert-p13n.interactor";
import type { RecordViewPolicy } from "@/features/records/record-view-policy";
import type { GetPlannerOptionsInteractor } from "./get-planner-options.interactor";
import type { ManageCalendarSubscriptionsInteractor } from "./manage-calendar-subscriptions.interactor";
import type { PlannerSource } from "./planner.schema";

import { randomUUID } from "node:crypto";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { recordSurfaceKey } from "@/core/data-view/data-view-keys";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { fail, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { isCalendarColorField, isCalendarDateField } from "@/features/record-calendar/record-calendar-query";
import {
  ManageCalendarResultSchema,
  ManageCalendarSchema,
  type ManageCalendarInput,
  type ManageCalendarResult,
} from "./manage-calendar.schema";
import { PLANNER_P13N_ID, PlannerConfigSchema } from "./planner.schema";

@AllowInDemoMode
@TenantInteractor()
export class ManageCalendarInteractor extends AuthenticatedInteractor<ManageCalendarInput, ManageCalendarResult> {
  constructor(
    private options: GetPlannerOptionsInteractor,
    private views: Pick<RecordViewPolicy, "describe" | "invalidCalendar" | "invalidFilter">,
    private p13n: Pick<UpsertP13nInteractor, "invoke">,
    private subscriptions: Pick<ManageCalendarSubscriptionsInteractor, "invoke">,
  ) {
    super();
  }

  @Validate(ManageCalendarSchema)
  @ValidateOutput(ManageCalendarResultSchema)
  async invoke(input: ManageCalendarInput): Validated<ManageCalendarResult> {
    const { action } = input;
    if (action === "subscriptions" || action === "revoke") {
      const result = await this.subscriptions.invoke(
        input.subscriptionId ? { action: "revoke", id: input.subscriptionId } : { action: "list" },
      );
      if (!result.ok) {
        return action === "revoke"
          ? failNotFound(CustomErrorCode.calendarSubscriptionNotFound, ["subscriptionId"])
          : result;
      }
      return {
        ok: true,
        data: { action, subscriptions: result.data.subscriptions },
      };
    }
    if (action === "update") {
      const current = await this.options.invoke();
      if (!current.ok) return current;
      const { config: previous, calendars } = current.data;
      const config = PlannerConfigSchema.safeParse({
        sources: (input.sources ?? previous.sources).map((source) => ({
          ...source,
          id: source.id ?? randomUUID(),
        })),
        calendarIds: input.calendarIds ?? previous.calendarIds,
        timeZone: input.timeZone ?? previous.timeZone,
        mode: input.mode ?? previous.mode,
      });
      if (!config.success) return fail(CustomErrorCode.recordValueInvalid, ["sources"]);
      const invalid = await this.invalid(input.sources ? config.data.sources : [], input.calendarIds ?? [], calendars);
      if (invalid) return invalid;
      const saved = await this.p13n.invoke({
        p13nId: PLANNER_P13N_ID,
        settings: config.data,
      });
      if (!saved.ok) return saved;
    }
    if (action === "reset") {
      const saved = await this.p13n.invoke({
        p13nId: PLANNER_P13N_ID,
        settings: null,
      });
      if (!saved.ok) return saved;
    }
    const options = await this.options.invoke();
    if (!options.ok) return options;
    const { model, config, saved, personalAvailable, calendars, readableTypeIds } = options.data;
    if (action !== "options") return { ok: true, data: { action, saved, config } };
    const lists = model.types
      .filter((type) => readableTypeIds.includes(type.id))
      .map((type) => {
        const fields = model.fields.filter((field) => field.typeId === type.id);
        return {
          typeId: type.id,
          label: type.pluralLabel,
          dateFields: fields.filter(isCalendarDateField).map(({ id, label, valueType }) => ({ id, label, valueType })),
          colorFields: fields.filter(isCalendarColorField).map(({ id, label }) => ({ id, label })),
        };
      })
      .filter((list) => list.dateFields.length > 0);
    return { ok: true, data: { action, lists, personalAvailable, calendars } };
  }

  private async invalid(sources: PlannerSource[], calendarIds: string[], calendars: Array<{ id: string }>) {
    for (const [index, source] of sources.entries()) {
      const surfaceKey = recordSurfaceKey(source.typeId);
      if (!(await this.views.describe(surfaceKey)))
        return failNotFound(CustomErrorCode.recordTypeNotFound, ["sources", index, "typeId"]);

      const calendar = await this.views.invalidCalendar(surfaceKey, source.calendar);
      if (calendar) {
        return fail(CustomErrorCode.invalidFilterField, ["sources", index, "calendar", calendar.key], {
          validValues: calendar.validValues.join(", "),
        });
      }
      const filter = await this.views.invalidFilter(surfaceKey, source.filters);
      if (filter) return fail(filter.code, ["sources", index, "filters", filter.index], filter.values);
    }
    const unknown = calendarIds.findIndex((id) => !calendars.some((calendar) => calendar.id === id));
    if (unknown >= 0) return failNotFound(CustomErrorCode.calendarNotFound, ["calendarIds", unknown]);
    return null;
  }
}
