import type { RecordModelView } from "@/features/records/record-model.schema";

export function widgetRelationshipChoices(model: RecordModelView | undefined | null, typeId: string) {
  return (
    model?.relationships
      .filter((relation) => !relation.archived)
      .flatMap((relation) => [
        ...(relation.sourceTypeId === typeId
          ? [{ value: `${relation.id}:outgoing`, label: relation.sourceLabel }]
          : []),
        ...(relation.targetTypeId === typeId
          ? [{ value: `${relation.id}:incoming`, label: relation.targetLabel }]
          : []),
      ]) ?? []
  );
}
