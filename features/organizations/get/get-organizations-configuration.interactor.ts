import type { FilterableField } from "@/core/base/base-get.schema";
import type { SortableField } from "@/core/base/base-query-builder";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { Resource, Action } from "@/generated/prisma";

import { GetConfigurationSchema } from "@/core/base/base-get.schema";

import { BaseInteractor } from "@/core/base/base-interactor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";

export interface GetOrganizationsConfigurationResult {
  customColumns: CustomColumnDto[];
  filterableFields: FilterableField[];
  sortableFields: string[];
}

export abstract class GetOrganizationsConfigurationRepo {
  abstract getCustomColumns(): Promise<CustomColumnDto[]>;
  abstract getFilterableFields(): Promise<FilterableField[]>;
  abstract getSortableFields(): SortableField[];
}

@AllowInDemoMode
@TentantInteractor({
  permissions: [
    { resource: Resource.organizations, action: Action.readAll },
    { resource: Resource.organizations, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetOrganizationsConfigurationInteractor extends BaseInteractor<void, GetOrganizationsConfigurationResult> {
  constructor(private repo: GetOrganizationsConfigurationRepo) {
    super();
  }

  @ValidateOutput(GetConfigurationSchema)
  async invoke(): Promise<{ ok: true; data: GetOrganizationsConfigurationResult }> {
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
