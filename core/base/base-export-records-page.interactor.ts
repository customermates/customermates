import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { ExportRecordsPageData } from "@/features/data-transfer/data-transfer.schema";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { EventService } from "@/features/event/event.service";
import type { Validated } from "@/core/validation/validation.utils";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { DomainEvent } from "@/features/event/domain-events";
import { EXPORT_ROW_LIMIT } from "@/features/data-transfer/data-transfer.schema";

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
  constructor(
    private repo: ExportRecordsRepo<T>,
    private eventService: EventService,
  ) {
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

    if (data.skip === 0) {
      await this.eventService.publish(DomainEvent.RECORDS_EXPORTED, {
        entityId: this.companyId,
        payload: {
          entityType: data.entityType,
          rowCount: Math.min(total, EXPORT_ROW_LIMIT),
          truncated: total > EXPORT_ROW_LIMIT,
          scope: data.selectedIds?.length ? "selection" : "view",
        },
      });
    }

    return { ok: true as const, data: { rows, customColumns, total, droppedSort: sortsByCustomColumn } };
  }
}
