import type { FilterableField } from "@/core/base/base-get.schema";
import type { SortableField } from "@/core/base/base-query-builder";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { Resource, Action } from "@/generated/prisma";

import { GetConfigurationSchema } from "@/core/base/base-get.schema";

import { BaseInteractor } from "@/core/base/base-interactor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export interface GetContactsConfigurationResult {
  customColumns: CustomColumnDto[];
  filterableFields: FilterableField[];
  sortableFields: string[];
}

export abstract class GetContactsConfigurationRepo {
  abstract getCustomColumns(): Promise<CustomColumnDto[]>;
  abstract getFilterableFields(): Promise<FilterableField[]>;
  abstract getSortableFields(): SortableField[];
}

@AllowInDemoMode
@TentantInteractor({
  permissions: [
    { resource: Resource.contacts, action: Action.readAll },
    { resource: Resource.contacts, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetContactsConfigurationInteractor extends BaseInteractor<void, GetContactsConfigurationResult> {
  constructor(private repo: GetContactsConfigurationRepo) {
    super();
  }

  @ValidateOutput(GetConfigurationSchema)
  async invoke(): Promise<{ ok: true; data: GetContactsConfigurationResult }> {
    const [customColumns, filterableFields] = await Promise.all([
      this.repo.getCustomColumns(),
      this.repo.getFilterableFields(),
    ]);
    const sortableFields = this.repo.getSortableFields().map((field) => field.field);

    return {
      ok: true,
      data: {
        customColumns,
        filterableFields,
        sortableFields,
      },
    };
  }
}
