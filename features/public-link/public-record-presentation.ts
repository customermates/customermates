import type { FilterableField, Filter, SortDescriptor } from "@/core/base/base-get.schema";
import type { RecordPresentationResult } from "@/features/records/get-record-presentation.interactor";
import type { RecordRow } from "@/features/records/record-presentation";

import { ViewMode } from "@/core/base/base-query-builder";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { recordChannelsField } from "@/features/records/record-channels";
import { recordColumns } from "@/features/records/record-columns";

const HIDDEN_TIMESTAMP = new Date(0).toISOString();
const UNFILTERABLE_VALUE_TYPES = new Set(["member", "file", "channels", "richText"]);
const SEARCHABLE_VALUE_TYPES = new Set(["text", "url", "address"]);

export type PublicVisitorQuery = { filters: Filter[]; searchTerm: string };

type Visible = {
  fieldIds: Set<string>;
  relationships: Set<string>;
  paths: Set<string>;
  columns: Set<string>;
  sortable: Set<string>;
  searchFieldIds: string[];
  filterable: FilterableField[];
};

function visibleColumns(data: RecordPresentationResult): Visible {
  const hidden = new Set(data.result.hiddenColumns ?? []);
  const primaryFieldId = data.model.types.find((type) => type.id === data.typeId)?.primaryFieldId;
  const columns = recordColumns(data.typeId, data.model).filter(
    (column) => !hidden.has(column.id) || column.id === primaryFieldId,
  );
  const shownFieldIds = new Set(columns.flatMap((column) => (column.kind === "field" ? [column.id] : [])));
  const avatarFieldIds = data.model.capabilities
    .filter(
      (binding) =>
        binding.kind === "avatar" &&
        binding.typeId === data.typeId &&
        binding.fields.every((field) => field.role === "image" || shownFieldIds.has(field.fieldId)),
    )
    .flatMap((binding) => binding.fields.filter((field) => field.role === "image").map((field) => field.fieldId));
  return {
    fieldIds: new Set([...shownFieldIds, ...avatarFieldIds]),
    relationships: new Set(
      columns.flatMap((column) =>
        column.kind === "relationship" ? [`${column.relation.id}:${column.direction}`] : [],
      ),
    ),
    paths: new Set(columns.flatMap((column) => (column.kind === "relationshipPath" ? [column.definition.id] : []))),
    columns: new Set(columns.map((column) => column.id)),
    sortable: new Set(columns.filter((column) => column.sortable).map((column) => column.id)),
    searchFieldIds: columns.flatMap((column) =>
      column.kind === "field" && SEARCHABLE_VALUE_TYPES.has(column.field.valueType) ? [column.id] : [],
    ),
    filterable: (data.result.filterableFields ?? []).filter((entry) => {
      const column = columns.find((candidate) => candidate.id === entry.field);
      if (!column) return false;
      if (column.kind === "system") return column.id !== "system:assignedTo";
      return column.kind === "field" && !UNFILTERABLE_VALUE_TYPES.has(column.field.valueType);
    }),
  };
}

export function publicScope(data: RecordPresentationResult) {
  const visible = visibleColumns(data);
  return { searchFieldIds: visible.searchFieldIds, filterable: visible.filterable };
}

export function publicFilterAllowed(filter: Filter, filterable: FilterableField[]): boolean {
  return filterable.some((entry) => entry.field === filter.field && entry.operators.includes(filter.operator));
}

function publicRow(row: RecordRow, visible: Visible, channelsVisible: boolean): RecordRow {
  const fields = row.fields.filter((field) => visible.fieldIds.has(field.fieldId));
  const memberIds = new Set(
    fields.flatMap(({ result }) =>
      result.state === "value" && result.value.kind === "member" ? [result.value.value] : [],
    ),
  );
  const fileIds = new Set(
    fields.flatMap(({ result }) =>
      result.state === "value" && result.value.kind === "file" ? result.value.value : [],
    ),
  );
  const assigned = visible.columns.has("system:assignedTo");
  return {
    ...row,
    createdAt: visible.columns.has("system:createdAt") ? row.createdAt : HIDDEN_TIMESTAMP,
    updatedAt: visible.columns.has("system:updatedAt") ? row.updatedAt : HIDDEN_TIMESTAMP,
    fields,
    assignedUserIds: assigned ? row.assignedUserIds : [],
    assignedUsers: assigned ? row.assignedUsers : [],
    memberUsers: row.memberUsers.filter((user) => memberIds.has(user.id)),
    relationships: row.relationships.filter((summary) =>
      visible.relationships.has(`${summary.relationId}:${summary.direction}`),
    ),
    ...(row.relationshipPaths
      ? { relationshipPaths: row.relationshipPaths.filter((summary) => visible.paths.has(summary.pathId)) }
      : {}),
    ...(row.identities ? { identities: channelsVisible ? row.identities : [] } : {}),
    ...(row.files
      ? { files: row.files.filter((file) => fileIds.has(file.id)).map((file) => ({ ...file, uploadedById: null })) }
      : {}),
  };
}

export function publicSortable(data: RecordPresentationResult, sort: SortDescriptor | undefined): boolean {
  return !sort || visibleColumns(data).sortable.has(sort.field);
}

export function publicRecordPresentation(
  data: RecordPresentationResult,
  visitor: PublicVisitorQuery = { filters: [], searchTerm: "" },
): RecordPresentationResult {
  const visible = visibleColumns(data);
  const channels = recordChannelsField(data.model, data.typeId);
  const channelsVisible = channels ? visible.fieldIds.has(channels.id) : false;
  const pathRelations = new Set(
    data.model.types
      .flatMap((type) => type.relationshipPaths ?? [])
      .filter((path) => visible.paths.has(path.id))
      .flatMap((path) => path.path.map((step) => step.relationId)),
  );
  const { result } = data;
  return {
    ...data,
    canManageSchema: false,
    permittedActions: [],
    formulaReferences: undefined,
    model: {
      ...data.model,
      types: data.model.types.map((type) => ({
        ...type,
        relationshipPaths: type.relationshipPaths?.filter((path) => visible.paths.has(path.id)),
      })),
      fields: data.model.fields
        .filter((field) => visible.fieldIds.has(field.id))
        .map((field) => (field.behavior.kind === "input" ? field : { ...field, behavior: { kind: "input" as const } })),
      relationships: data.model.relationships.filter(
        (relation) =>
          visible.relationships.has(`${relation.id}:outgoing`) ||
          visible.relationships.has(`${relation.id}:incoming`) ||
          pathRelations.has(relation.id),
      ),
      capabilities: data.model.capabilities.filter((binding) =>
        binding.fields.every((field) => visible.fieldIds.has(field.fieldId)),
      ),
      accessPresets: [],
    },
    query: {
      typeId: data.query.typeId,
      filters: [],
      relationships: [],
      sort: data.query.sort.filter((entry) => visible.sortable.has(entry.fieldId)),
      page: data.query.page,
      pageSize: data.query.pageSize,
    },
    result: {
      p13nId: result.p13nId,
      items: result.items.map((row) => publicRow(row, visible, channelsVisible)),
      filters: visitor.filters,
      searchTerm: visitor.searchTerm,
      sortDescriptor:
        result.sortDescriptor && visible.sortable.has(result.sortDescriptor.field) ? result.sortDescriptor : undefined,
      pagination: result.pagination,
      filterableFields: visible.filterable,
      columnOrder: result.columnOrder?.filter((id) => visible.columns.has(id)),
      columnWidths: result.columnWidths,
      hiddenColumns: result.hiddenColumns?.filter((id) => id.startsWith("system:")),
      viewMode: ViewMode.table,
      groupableFields: [],
      views: [],
      activeViewKey: ALL_VIEW_KEY,
      allState: {},
      viewPersistable: false,
    },
  };
}
