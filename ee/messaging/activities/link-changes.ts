import type { RecordHistoryChanges } from "@/features/records/record-history-reader";
import type { RecordModel, RecordRef } from "@/features/records/record-model.schema";

import { recordKey } from "@/features/records/record-calculation.service";

type Changes = NonNullable<RecordHistoryChanges>;

export function linkChanges(
  changes: Changes,
  model: RecordModel,
  title: (ref: RecordRef) => string | undefined,
): Changes["related"] {
  const groups = new Map<string, Changes["related"][number]>();
  for (const link of changes.links) {
    const relation = model.relationships.find((candidate) => candidate.id === link.relationId);
    if (!relation) continue;
    const outgoing = recordKey(link.source) === recordKey(changes.ref);
    const other: RecordRef = outgoing ? link.target : link.source;
    const label = outgoing ? relation.sourceLabel : relation.targetLabel;
    const group = groups.get(`${relation.id}:${outgoing}`) ?? { label, before: [], after: [] };
    const record = {
      ref: other,
      title: title(other) ?? model.types.find((type) => type.id === other.typeId)?.label ?? "",
    };
    if (link.before) group.before.push(record);
    if (link.after) group.after.push(record);
    groups.set(`${relation.id}:${outgoing}`, group);
  }
  return [...groups.values()];
}
