import type { RecordField, RecordModel, RecordRelationship } from "./record-model.schema";

import type { RecordSystemColumnSchema } from "./record-column.schema";
import { relationshipColumnKey, relationshipPathColumnKey } from "./record-column.schema";
import { recordChannelsEnabled } from "./record-channels";
import { resolveRecordPath } from "./record-relationship-path";
import type { RecordRelationshipPath } from "./record-relationship-path.schema";

export type RecordColumn =
  | { kind: "field"; id: string; label: string; sortable: boolean; field: RecordField }
  | { kind: "identity"; id: "system:channels"; label: string; sortable: false }
  | {
      kind: "relationship";
      id: string;
      label: string;
      sortable: false;
      relation: RecordRelationship;
      direction: "outgoing" | "incoming";
    }
  | {
      kind: "relationshipPath";
      id: string;
      label: string;
      sortable: false;
      definition: RecordRelationshipPath;
      targetTypeId: string;
    }
  | {
      kind: "system";
      id: (typeof RecordSystemColumnSchema.options)[number];
      label: string;
      sortable: boolean;
    };

export function recordColumns(typeId: string, model: RecordModel): RecordColumn[] {
  const columns: RecordColumn[] = model.fields
    .filter((field) => field.typeId === typeId && !field.archived && field.valueType !== "richText")
    .map((field) => ({
      kind: "field",
      id: field.id,
      label: field.label,
      sortable: !["dateRange", "dateTimeRange"].includes(field.valueType),
      field,
    }));
  for (const relation of model.relationships) {
    if (relation.archived) continue;
    for (const direction of ["outgoing", "incoming"] as const) {
      if ((direction === "outgoing" ? relation.sourceTypeId : relation.targetTypeId) !== typeId) continue;
      columns.push({
        kind: "relationship",
        id: relationshipColumnKey(relation.id, direction),
        label: direction === "outgoing" ? relation.sourceLabel : relation.targetLabel,
        sortable: false,
        relation,
        direction,
      });
    }
  }
  for (const definition of model.types.find((type) => type.id === typeId)?.relationshipPaths ?? []) {
    if (definition.archived) continue;
    const steps = resolveRecordPath(typeId, definition.path, model);
    const targetTypeId = steps?.at(-1)?.typeId;
    if (targetTypeId) {
      columns.push({
        kind: "relationshipPath",
        id: relationshipPathColumnKey(definition.id),
        label: definition.label,
        sortable: false,
        definition,
        targetTypeId,
      });
    }
  }
  if (recordChannelsEnabled(model, typeId))
    columns.push({ kind: "identity", id: "system:channels", label: "channels", sortable: false });
  columns.push(
    { kind: "system", id: "system:assignedTo", label: "assignedTo", sortable: false },
    { kind: "system", id: "system:createdAt", label: "createdAt", sortable: true },
    { kind: "system", id: "system:updatedAt", label: "updatedAt", sortable: true },
  );
  return columns;
}
