import type { RecordSearchHit } from "@/features/records/record-search.schema";

export function recordSearchHit(
  typeId: string,
  recordId: string,
  title: string,
  typeLabel = "Project",
): RecordSearchHit {
  return {
    ref: { typeId, recordId },
    title: { state: "value", value: { kind: "text", value: title } },
    typeLabel,
    typePluralLabel: `${typeLabel}s`,
    icon: "folder",
    pictureUrl: null,
  };
}
