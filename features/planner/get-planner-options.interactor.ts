import type { GetRecordModelInteractor } from "@/features/records/get-record-model.interactor";
import type { RecordModelView } from "@/features/records/record-model.schema";
import type { GetP13nRepo } from "@/features/p13n/get-p13n.interactor";
import type { PlannerPersonalEvents, PersonalCalendar } from "./planner.repo";
import type { PlannerConfig } from "./planner.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { readP13nSettings } from "@/features/p13n/p13n-settings.schema";
import { emptyPlannerConfig, PLANNER_P13N_ID } from "./planner.schema";

export type PlannerOptions = {
  model: RecordModelView;
  config: PlannerConfig;
  personalAvailable: boolean;
  calendars: PersonalCalendar[];
};
@AllowInDemoMode
@TenantInteractor()
export class GetPlannerOptionsInteractor extends AuthenticatedInteractor<void, PlannerOptions> {
  constructor(
    private models: GetRecordModelInteractor,
    private settings: GetP13nRepo,
    private personal: PlannerPersonalEvents,
  ) {
    super();
  }
  async invoke(): Validated<PlannerOptions> {
    const model = await this.models.invoke({});
    if (!model.ok) return model;
    const [saved, personal] = await Promise.all([this.settings.getP13n(PLANNER_P13N_ID), this.personal.calendars()]);
    const config = readP13nSettings(PLANNER_P13N_ID, saved?.settings) ?? emptyPlannerConfig();
    return {
      ok: true,
      data: { model: model.data, config, personalAvailable: personal.available, calendars: personal.calendars },
    };
  }
}
