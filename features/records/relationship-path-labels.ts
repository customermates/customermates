import type { RecordModel } from "./record-model.schema";
import { resolveRecordPath } from "./record-relationship-path";

export function labelRelationshipPaths(
  model: Pick<RecordModel, "types" | "relationships">,
  pluralLabelOf: (typeId: string) => string,
): void {
  for (const type of model.types) {
    for (const path of type.relationshipPaths ?? []) {
      const end = resolveRecordPath(type.id, path.path, model)?.at(-1);
      if (end) path.label = pluralLabelOf(end.typeId);
    }
  }
}
