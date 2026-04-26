import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { FilterableField, SortableFieldDescriptor } from "./base-get.schema";
import type { SortableField } from "./base-query-builder";

import { BaseInteractor } from "./base-interactor";

export interface GetConfigurationResult {
  customColumns: CustomColumnDto[];
  filterableFields: FilterableField[];
  sortableFields: SortableFieldDescriptor[];
}

export abstract class GetConfigurationRepo {
  abstract getCustomColumns(): Promise<CustomColumnDto[]>;
  abstract getFilterableFields(): Promise<FilterableField[]>;
  abstract getSortableFields(): SortableField[];
}

export abstract class BaseGetConfigurationInteractor extends BaseInteractor<void, GetConfigurationResult> {
  constructor(protected repo: GetConfigurationRepo) {
    super();
  }

  async invoke(): Promise<{ ok: true; data: GetConfigurationResult }> {
    const [customColumns, filterableFields] = await Promise.all([
      this.repo.getCustomColumns(),
      this.repo.getFilterableFields(),
    ]);
    const sortableFields: SortableFieldDescriptor[] = [
      ...this.repo.getSortableFields().map((f) => ({ field: f.field })),
      ...customColumns.map((c) => ({ field: c.id, label: c.label, columnType: c.type })),
    ];

    return { ok: true, data: { customColumns, filterableFields, sortableFields } };
  }
}
