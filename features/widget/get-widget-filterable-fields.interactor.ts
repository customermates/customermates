import type { FilterableField } from "@/core/base/base-get.schema";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { z } from "zod";
import { EntityType } from "@/generated/prisma";

import { FilterableFieldSchema } from "@/core/base/base-get.schema";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export abstract class GetWidgetFilterableFieldsContactRepo {
  abstract getFilterableFields(): Promise<FilterableField[]>;
}

export abstract class GetWidgetFilterableFieldsOrganizationRepo {
  abstract getFilterableFields(): Promise<FilterableField[]>;
}

export abstract class GetWidgetFilterableFieldsDealRepo {
  abstract getFilterableFields(): Promise<FilterableField[]>;
}

export abstract class GetWidgetFilterableFieldsServiceRepo {
  abstract getFilterableFields(): Promise<FilterableField[]>;
}

export abstract class GetWidgetFilterableFieldsTaskRepo {
  abstract getFilterableFields(): Promise<FilterableField[]>;
}

export abstract class GetWidgetActivityFilterableFieldsRepo {
  abstract canReadMessagingSources(): boolean;
  abstract getFilterableFields(): Promise<FilterableField[]>;
  abstract setMessagingSourcesEnabled(enabled: boolean): void;
}

export type WidgetFilterableFields = {
  chart: Record<EntityType, FilterableField[]>;
  activityTimeline: FilterableField[];
};

const WidgetFilterableFieldsSchema = z.object({
  activityTimeline: z.array(FilterableFieldSchema),
  chart: z.record(z.enum(EntityType), z.array(FilterableFieldSchema)),
});

@AllowInDemoMode
@TenantInteractor()
export class GetWidgetFilterableFieldsInteractor extends AuthenticatedInteractor<void, WidgetFilterableFields> {
  constructor(
    private contactRepo: GetWidgetFilterableFieldsContactRepo,
    private organizationRepo: GetWidgetFilterableFieldsOrganizationRepo,
    private dealRepo: GetWidgetFilterableFieldsDealRepo,
    private serviceRepo: GetWidgetFilterableFieldsServiceRepo,
    private taskRepo: GetWidgetFilterableFieldsTaskRepo,
    private activityRepo: GetWidgetActivityFilterableFieldsRepo,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @ValidateOutput(WidgetFilterableFieldsSchema)
  async invoke(): Promise<{ ok: true; data: WidgetFilterableFields }> {
    const canReadMessagingSources = this.activityRepo.canReadMessagingSources();
    const entitlementDenied = canReadMessagingSources ? await this.entitlements.require("messaging") : null;
    this.activityRepo.setMessagingSourcesEnabled(canReadMessagingSources && !entitlementDenied);

    const [contactFields, organizationFields, dealFields, serviceFields, taskFields, activityTimeline] =
      await Promise.all([
        this.contactRepo.getFilterableFields(),
        this.organizationRepo.getFilterableFields(),
        this.dealRepo.getFilterableFields(),
        this.serviceRepo.getFilterableFields(),
        this.taskRepo.getFilterableFields(),
        this.activityRepo.getFilterableFields(),
      ]);

    return {
      ok: true,
      data: {
        activityTimeline,
        chart: {
          [EntityType.contact]: contactFields,
          [EntityType.organization]: organizationFields,
          [EntityType.deal]: dealFields,
          [EntityType.service]: serviceFields,
          [EntityType.task]: taskFields,
        },
      },
    };
  }
}
