import type { FilterableField } from "@/core/base/base-get.schema";
import type { SortableField } from "@/core/base/base-query-builder";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { Resource, Action } from "@/generated/prisma";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";

export interface GetServicesConfigurationResult {
  customColumns: CustomColumnDto[];
  filterableFields: FilterableField[];
  sortableFields: string[];
}

export abstract class GetServicesConfigurationRepo {
  abstract getCustomColumns(): Promise<CustomColumnDto[]>;
  abstract getFilterableFields(): Promise<FilterableField[]>;
  abstract getSortableFields(): SortableField[];
}

@AllowInDemoMode
@TentantInteractor({
  permissions: [
    { resource: Resource.services, action: Action.readAll },
    { resource: Resource.services, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetServicesConfigurationInteractor {
  constructor(private repo: GetServicesConfigurationRepo) {}

  async invoke(): Promise<GetServicesConfigurationResult> {
    const [customColumns, filterableFields] = await Promise.all([
      this.repo.getCustomColumns(),
      this.repo.getFilterableFields(),
    ]);
    const sortableFields = this.repo.getSortableFields().map((field) => field.field);

    return {
      customColumns,
      filterableFields,
      sortableFields,
    };
  }
}
