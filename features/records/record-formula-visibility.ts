import type { RecordField, RecordFieldView, RecordModel } from "./record-model.schema";

import { expressionFieldDependencies, expressionRelationshipDependencies } from "./record-model-validation";

type FormulaReader = { isAdmin: boolean; canManageSchema: boolean; canReadType: (typeId: string) => boolean };

export function visibleFormulaFields(
  fields: RecordField[],
  model: RecordModel,
  reader: FormulaReader,
): RecordFieldView[] {
  if (reader.isAdmin || reader.canManageSchema) return fields;
  return fields.map((field) => withVisibleFormula(field, model, reader.canReadType));
}

function withVisibleFormula(
  field: RecordField,
  model: RecordModel,
  canReadType: (typeId: string) => boolean,
): RecordFieldView {
  const { behavior } = field;
  if (behavior.kind === "input") return field;
  const fieldIds = expressionFieldDependencies(behavior.expression);
  if (behavior.kind === "snapshot" && behavior.triggerFieldId) fieldIds.add(behavior.triggerFieldId);
  const readable =
    [...fieldIds].every((id) => {
      const input = model.fields.find((candidate) => candidate.id === id);
      return Boolean(input && canReadType(input.typeId));
    }) &&
    [...expressionRelationshipDependencies(behavior.expression)].every((id) => {
      const relation = model.relationships.find((candidate) => candidate.id === id);
      return Boolean(relation && canReadType(relation.sourceTypeId) && canReadType(relation.targetTypeId));
    });
  if (readable) return field;
  return {
    ...field,
    behavior:
      behavior.kind === "snapshot"
        ? {
            kind: "snapshot",
            capture: behavior.capture,
            ...(behavior.allowManualOverride === undefined
              ? {}
              : { allowManualOverride: behavior.allowManualOverride }),
          }
        : { kind: behavior.kind },
  };
}
