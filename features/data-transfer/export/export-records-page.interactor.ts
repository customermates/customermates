import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { ExportRecordsPageData } from "../data-transfer.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { ExportRecordsPageSchema } from "../data-transfer.schema";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";

export type ExportPageParams = GetQueryParams & { selectedIds?: string[] };

export abstract class ExportRecordsRepo<T> {
  abstract exportItems(params: ExportPageParams): Promise<T[]>;
  abstract exportCount(params: ExportPageParams): Promise<number>;
  abstract getCustomColumns(): Promise<CustomColumnDto[]>;
}

export type ExportPageResult<T> = {
  rows: T[];
  customColumns: CustomColumnDto[];
  total: number;
  droppedSort: boolean;
};

const readPermissions = (resource: Resource) => ({
  permissions: [
    { resource, action: Action.readAll },
    { resource, action: Action.readOwn },
  ],
  condition: "OR" as const,
});

export abstract class BaseExportRecordsPageInteractor<T> extends AuthenticatedInteractor<
  ExportRecordsPageData,
  ExportPageResult<T>
> {
  constructor(private repo: ExportRecordsRepo<T>) {
    super();
  }

  async invoke(data: ExportRecordsPageData): Validated<ExportPageResult<T>> {
    const customColumns = await this.repo.getCustomColumns();

    const sortsByCustomColumn =
      data.sortDescriptor !== undefined && customColumns.some((column) => column.id === data.sortDescriptor?.field);

    const params: ExportPageParams = {
      filters: data.filters,
      searchTerm: data.searchTerm,
      sortDescriptor: sortsByCustomColumn ? undefined : data.sortDescriptor,
      selectedIds: data.selectedIds,
      skip: data.skip,
      take: data.take,
    };

    const [rows, total] = await Promise.all([this.repo.exportItems(params), this.repo.exportCount(params)]);

    return { ok: true as const, data: { rows, customColumns, total, droppedSort: sortsByCustomColumn } };
  }
}

@AllowInDemoMode
@TenantInteractor(readPermissions(Resource.contacts))
export class ExportContactsPageInteractor<T> extends BaseExportRecordsPageInteractor<T> {
  @Validate(ExportRecordsPageSchema)
  async invoke(data: ExportRecordsPageData): Validated<ExportPageResult<T>> {
    return await super.invoke(data);
  }
}

@AllowInDemoMode
@TenantInteractor(readPermissions(Resource.organizations))
export class ExportOrganizationsPageInteractor<T> extends BaseExportRecordsPageInteractor<T> {
  @Validate(ExportRecordsPageSchema)
  async invoke(data: ExportRecordsPageData): Validated<ExportPageResult<T>> {
    return await super.invoke(data);
  }
}

@AllowInDemoMode
@TenantInteractor(readPermissions(Resource.deals))
export class ExportDealsPageInteractor<T> extends BaseExportRecordsPageInteractor<T> {
  @Validate(ExportRecordsPageSchema)
  async invoke(data: ExportRecordsPageData): Validated<ExportPageResult<T>> {
    return await super.invoke(data);
  }
}

@AllowInDemoMode
@TenantInteractor(readPermissions(Resource.services))
export class ExportServicesPageInteractor<T> extends BaseExportRecordsPageInteractor<T> {
  @Validate(ExportRecordsPageSchema)
  async invoke(data: ExportRecordsPageData): Validated<ExportPageResult<T>> {
    return await super.invoke(data);
  }
}

@AllowInDemoMode
@TenantInteractor(readPermissions(Resource.tasks))
export class ExportTasksPageInteractor<T> extends BaseExportRecordsPageInteractor<T> {
  @Validate(ExportRecordsPageSchema)
  async invoke(data: ExportRecordsPageData): Validated<ExportPageResult<T>> {
    return await super.invoke(data);
  }
}
