import type { FilterableField } from "@/core/base/base-get.schema";

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

@AllowInDemoMode
@TenantInteractor()
export class GetWidgetFilterableFieldsInteractor extends AuthenticatedInteractor<
  void,
  Record<EntityType, FilterableField[]>
> {
  constructor(
    private contactRepo: GetWidgetFilterableFieldsContactRepo,
    private organizationRepo: GetWidgetFilterableFieldsOrganizationRepo,
    private dealRepo: GetWidgetFilterableFieldsDealRepo,
    private serviceRepo: GetWidgetFilterableFieldsServiceRepo,
    private taskRepo: GetWidgetFilterableFieldsTaskRepo,
  ) {
    super();
  }

  @ValidateOutput(z.record(z.enum(EntityType), z.array(FilterableFieldSchema)))
  async invoke(): Promise<{ ok: true; data: Record<EntityType, FilterableField[]> }> {
    const [contactFields, organizationFields, dealFields, serviceFields, taskFields] = await Promise.all([
      this.contactRepo.getFilterableFields(),
      this.organizationRepo.getFilterableFields(),
      this.dealRepo.getFilterableFields(),
      this.serviceRepo.getFilterableFields(),
      this.taskRepo.getFilterableFields(),
    ]);

    return {
      ok: true,
      data: {
        [EntityType.contact]: contactFields,
        [EntityType.organization]: organizationFields,
        [EntityType.deal]: dealFields,
        [EntityType.service]: serviceFields,
        [EntityType.task]: taskFields,
      },
    };
  }
}
