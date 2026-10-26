import type { GetRecordModelInteractor } from "@/features/records/get-record-model.interactor";
import type { RecordModelView } from "@/features/records/record-model.schema";
import type { GetP13nRepo } from "@/features/p13n/get-p13n.interactor";
import type { RecordViewPolicy } from "@/features/records/record-view-policy";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";
import type { PlannerPersonalEventsRepo, PersonalCalendar } from "./planner.repo";
import type { PlannerConfig } from "./planner.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { Resource } from "@/generated/prisma";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { roleCanRead } from "@/core/base/permission.service";
import { recordSurfaceTypeId } from "@/core/data-view/data-view-keys";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { readP13nSettings } from "@/features/p13n/p13n-settings.schema";
import { defaultPlannerConfig, PLANNER_P13N_ID } from "./planner.schema";

export type PlannerOptions = {
  model: RecordModelView;
  config: PlannerConfig;
  saved: boolean;
  personalAvailable: boolean;
  calendars: PersonalCalendar[];
};
@AllowInDemoMode
@TenantInteractor()
export class GetPlannerOptionsInteractor extends AuthenticatedInteractor<void, PlannerOptions> {
  constructor(
    private models: GetRecordModelInteractor,
    private settings: GetP13nRepo,
    private personal: PlannerPersonalEventsRepo,
    private entitlements: Pick<EntitlementService, "require">,
    private views: Pick<RecordViewPolicy, "list">,
  ) {
    super();
  }
  async invoke(): Validated<PlannerOptions> {
    const model = await this.models.invoke({});
    if (!model.ok) return model;
    const [saved, denied, readable] = await Promise.all([
      this.settings.getP13n(PLANNER_P13N_ID),
      this.entitlements.require("messaging"),
      this.views.list(),
    ]);
    const personalAvailable = roleCanRead(this.user.role, Resource.inboxMessages) && !denied;
    const config = readP13nSettings(PLANNER_P13N_ID, saved?.settings);
    const readableTypeIds = new Set(readable.map((view) => recordSurfaceTypeId(view.surfaceKey)));
    const visible = { ...model.data, types: model.data.types.filter((type) => readableTypeIds.has(type.id)) };
    const calendars = personalAvailable ? await this.personal.calendars() : [];
    return {
      ok: true,
      data: {
        model: visible,
        config: config ?? defaultPlannerConfig(visible),
        saved: config !== null,
        personalAvailable,
        calendars,
      },
    };
  }
}
