import type { useTranslations } from "next-intl";
import type { RootStore } from "@/core/stores/root.store";
import type { RecordDto, RecordModelView, RecordRelationship } from "@/features/records/record-model.schema";
import type { LinkedRecordsLink } from "@/features/records/linked-records-link";

import { recordDisplayName } from "@/features/records/record-display-name";

export function openLinkedRecords(
  root: RootStore,
  {
    source,
    model,
    link,
    targetTypeId,
    label,
    t,
  }: {
    source: Pick<RecordDto, "ref" | "fields">;
    model: Pick<RecordModelView, "types">;
    link: LinkedRecordsLink;
    targetTypeId: string;
    label: string;
    t: ReturnType<typeof useTranslations>;
  },
  opener: HTMLElement | null,
  fallback?: HTMLElement | null,
) {
  const type = model.types.find((candidate) => candidate.id === source.ref.typeId);
  root.recordWorkspaceStore.openLinkedRecords({
    source: source.ref,
    sourceName: recordDisplayName(
      source.fields.find((value) => value.fieldId === type?.primaryFieldId)?.result,
      type?.label,
      t,
    ),
    link,
    targetTypeId,
    label,
    opener,
    fallback,
  });
}

export function linkedRecordsTarget(
  column:
    | { kind: "relationship"; relation: RecordRelationship; direction: "outgoing" | "incoming" }
    | { kind: "relationshipPath"; definition: { id: string }; targetTypeId: string },
): { link: LinkedRecordsLink; targetTypeId: string } {
  if (column.kind === "relationshipPath")
    return { link: { pathId: column.definition.id }, targetTypeId: column.targetTypeId };

  const { relation, direction } = column;
  return {
    link: { relationId: relation.id, direction },
    targetTypeId: direction === "outgoing" ? relation.targetTypeId : relation.sourceTypeId,
  };
}
