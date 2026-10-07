import type { DataViewState } from "@/core/data-view/data-view-state.schema";
import type { RecordModel } from "./record-model.schema";

import { presentationFiltersAreValid, presentationQuery } from "./record-presentation";
import { invalidRecordQueryPart } from "./record-query-validation";
import { recordColumns } from "./record-columns";
import { resolveRecordGrouping } from "./record-grouping";

export function recordViewStateIsValid(typeId: string, state: DataViewState, model: RecordModel): boolean {
  if (!model.types.some((type) => type.id === typeId && !type.archived)) return false;
  const fields = model.fields.filter((field) => field.typeId === typeId && !field.archived);
  const paths = model.types.find((type) => type.id === typeId)?.relationshipPaths;
  const ids = new Set(recordColumns(typeId, model).map((column) => column.id));
  if (
    [...(state.columnOrder ?? []), ...(state.hiddenColumns ?? []), ...Object.keys(state.columnWidths ?? {})].some(
      (id) => !ids.has(id),
    )
  )
    return false;
  if (state.grouping && !resolveRecordGrouping(typeId, state.grouping, model)) return false;
  if (!presentationFiltersAreValid(state.filters ?? [], fields, model.relationships, typeId, paths)) return false;
  try {
    const query = presentationQuery(
      typeId,
      fields,
      { ...state, sortDescriptor: state.sortDescriptor ?? undefined },
      model.relationships,
      paths,
    );
    return !invalidRecordQueryPart(query, model);
  } catch {
    return false;
  }
}
