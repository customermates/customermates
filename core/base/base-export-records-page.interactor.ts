import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { ExportRecordsPageData } from "@/features/data-transfer/data-transfer.schema";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { Validated } from "@/core/validation/validation.utils";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

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
