import type { RecordFieldView, RecordModel, RecordModelView } from "./record-model.schema";

import type { RecordRelationshipSelection } from "./record-column.schema";

import { expressionFieldDependencies, expressionRelationshipDependencies } from "./record-model-validation";
import { linkedFlow } from "./calculation-sentence";

export type FormulaReferences = {
  fields: Array<Pick<RecordFieldView, "id" | "typeId" | "label"> & { options: Array<{ id: string; label: string }> }>;
  types: Array<Pick<RecordModelView["types"][number], "id" | "label" | "pluralLabel" | "icon">>;
  relationships: RecordModelView["relationships"];
};

export type SentenceModel = {
  fields: FormulaReferences["fields"];
  types: FormulaReferences["types"];
  relationships: RecordModelView["relationships"];
};

export function formulaReferences(
  fields: RecordFieldView[],
  model: RecordModel,
  present: Pick<RecordModelView, "fields" | "types" | "relationships">,
  canReadType: (typeId: string) => boolean,
): FormulaReferences {
  const fieldIds = new Set<string>();
  const relationIds = new Set<string>();
  for (const { behavior } of fields) {
    if (behavior.kind === "input") continue;
    if (behavior.kind === "snapshot" && behavior.triggerFieldId) fieldIds.add(behavior.triggerFieldId);
    if (!behavior.expression) continue;
    for (const id of expressionFieldDependencies(behavior.expression)) fieldIds.add(id);
    for (const id of expressionRelationshipDependencies(behavior.expression)) relationIds.add(id);
  }
  const has = <T extends { id: string }>(items: T[], id: string) => items.some((item) => item.id === id);
  const relationships = model.relationships.filter(
    (relation) =>
      relationIds.has(relation.id) &&
      !relation.archived &&
      canReadType(relation.sourceTypeId) &&
      canReadType(relation.targetTypeId) &&
      !has(present.relationships, relation.id),
  );
  const referencedFields = model.fields.filter(
    (field) => fieldIds.has(field.id) && !field.archived && canReadType(field.typeId) && !has(present.fields, field.id),
  );
  const typeIds = new Set([
    ...referencedFields.map((field) => field.typeId),
    ...[...relationIds].flatMap((id) => {
      const relation = model.relationships.find((candidate) => candidate.id === id);
      return relation ? [relation.sourceTypeId, relation.targetTypeId] : [];
    }),
  ]);
  return {
    fields: referencedFields.map((field) => ({
      id: field.id,
      typeId: field.typeId,
      label: field.label,
      options: field.options.map((option) => ({ id: option.id, label: option.label })),
    })),
    types: model.types
      .filter((type) => typeIds.has(type.id) && !type.archived && canReadType(type.id) && !has(present.types, type.id))
      .map((type) => ({ id: type.id, label: type.label, pluralLabel: type.pluralLabel, icon: type.icon })),
    relationships,
  };
}

export function withFormulaReferences(model: SentenceModel, references: FormulaReferences | undefined): SentenceModel {
  if (!references) return model;
  return {
    fields: [...model.fields, ...references.fields],
    types: [...model.types, ...references.types],
    relationships: [...model.relationships, ...references.relationships],
  };
}

export function lookupSelections(
  fields: RecordFieldView[],
  typeId: string,
  relationships: Pick<RecordModelView["relationships"][number], "id">[],
): RecordRelationshipSelection[] {
  const selections = new Map<string, RecordRelationshipSelection>();
  for (const { behavior, typeId: fieldTypeId } of fields) {
    if (fieldTypeId !== typeId || behavior.kind !== "lookup" || !behavior.expression) continue;
    const [hop, ...rest] = linkedFlow(behavior.expression).hops;
    if (!hop || rest.length || !relationships.some((relation) => relation.id === hop.relationId)) continue;
    selections.set(`${hop.relationId}:${hop.direction}`, {
      relationId: hop.relationId,
      direction: hop.direction,
      limit: 1,
    });
  }
  return [...selections.values()];
}
