import type { FilterableField } from "@/core/base/base-get.schema";

import { EntityType } from "@/generated/prisma";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";

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

@AllowInDemoMode
@TentantInteractor()
export class GetWidgetFilterableFieldsInteractor {
  constructor(
    private contactRepo: GetWidgetFilterableFieldsContactRepo,
    private organizationRepo: GetWidgetFilterableFieldsOrganizationRepo,
    private dealRepo: GetWidgetFilterableFieldsDealRepo,
    private serviceRepo: GetWidgetFilterableFieldsServiceRepo,
    private taskRepo: GetWidgetFilterableFieldsTaskRepo,
  ) {}

  async invoke(): Promise<Record<EntityType, FilterableField[]>> {
    const [contactFields, organizationFields, dealFields, serviceFields, taskFields] = await Promise.all([
      this.contactRepo.getFilterableFields(),
      this.organizationRepo.getFilterableFields(),
      this.dealRepo.getFilterableFields(),
      this.serviceRepo.getFilterableFields(),
      this.taskRepo.getFilterableFields(),
    ]);

    return {
      [EntityType.contact]: contactFields,
      [EntityType.organization]: organizationFields,
      [EntityType.deal]: dealFields,
      [EntityType.service]: serviceFields,
      [EntityType.task]: taskFields,
    };
  }
}
