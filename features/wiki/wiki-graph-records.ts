import type { RecordModel } from "@/features/records/record-model.schema";
import type { WikiGraphRecordType } from "./wiki-graph.schema";

export function wikiGraphRecordTypes(
  model: RecordModel,
  typeIds: Iterable<string>,
  canReadType: (typeId: string) => boolean,
): WikiGraphRecordType[] {
  const wanted = new Set(typeIds);
  return model.types
    .filter((type) => wanted.has(type.id) && !type.archived && canReadType(type.id))
    .map((type) => ({
      id: type.id,
      label: type.label,
      pluralLabel: type.pluralLabel,
      icon: type.icon,
      ...(type.color ? { color: type.color } : {}),
    }));
}
