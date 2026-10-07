import { omit } from "lodash";

import type {
  CalculationExpression,
  RecordField,
  RecordFieldView,
  RecordModelView,
  RecordType,
} from "@/features/records/record-model.schema";
import type { ConfigurationChange } from "@/features/records/configuration.schema";
import { compareRecordKey } from "@/features/records/record-json";

export type ConfigureFieldSource =
  | { kind: "input" | "formula" | "snapshot" }
  | { kind: "lookup" | "rollup"; list: string | null };

const byPosition = (left: RecordType, right: RecordType) =>
  left.position - right.position || compareRecordKey(left.id, right.id);

export function configureParentId(model: RecordModelView, type: RecordType): string | null {
  if (!type.parentRelationshipId) return null;
  const relation = model.relationships.find((candidate) => candidate.id === type.parentRelationshipId);
  if (!relation || relation.sourceTypeId !== type.id || relation.targetTypeId === type.id) return null;
  return model.types.some((candidate) => candidate.id === relation.targetTypeId) ? relation.targetTypeId : null;
}

export function configureLists(model: RecordModelView, showArchived = false): RecordType[] {
  const children = new Map<string, RecordType[]>();
  const roots: RecordType[] = [];
  for (const type of [...model.types].sort(byPosition)) {
    const parentId = configureParentId(model, type);
    if (parentId) children.set(parentId, [...(children.get(parentId) ?? []), type]);
    else roots.push(type);
  }
  const lists: RecordType[] = [];
  const visited = new Set<string>();
  const visit = (type: RecordType) => {
    if (visited.has(type.id)) return;
    visited.add(type.id);
    if (type.archived && !showArchived) return;
    lists.push(type);
    for (const child of children.get(type.id) ?? []) visit(child);
  };
  for (const root of roots) visit(root);
  for (const type of [...model.types].sort(byPosition)) visit(type);
  return lists;
}

export function configureCounts(model: RecordModelView, typeId: string) {
  const type = model.types.find((candidate) => candidate.id === typeId);
  return {
    fields: model.fields.filter((field) => field.typeId === typeId && !field.archived).length,
    relationships:
      model.relationships.filter(
        (relation) => !relation.archived && (relation.sourceTypeId === typeId || relation.targetTypeId === typeId),
      ).length + (type?.relationshipPaths ?? []).filter((path) => !path.archived).length,
    activity: model.activityPaths.filter((path) => path.typeId === typeId && !path.archived).length,
  };
}

export function configureFieldOrder(model: RecordModelView, typeId: string): string[] {
  return model.fields.filter((field) => field.typeId === typeId).map((field) => field.id);
}

export function moveConfigureField(order: readonly string[], activeId: string, overId: string): string[] {
  const from = order.indexOf(activeId);
  const to = order.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return [...order];
  const next = [...order];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

export function isResolvedField(field: RecordFieldView): field is RecordField {
  return field.behavior.kind === "input" || field.behavior.expression !== undefined;
}

export function reorderFieldOperations(
  model: RecordModelView,
  typeId: string,
  order: readonly string[],
): ConfigurationChange["operations"] {
  const current = configureFieldOrder(model, typeId);
  if (current.length !== order.length || current.every((id, index) => order[index] === id)) return [];
  const fields = order.flatMap((fieldId) =>
    model.fields.filter((field) => field.id === fieldId && field.typeId === typeId).filter(isResolvedField),
  );
  if (fields.length !== order.length) return [];
  const offset = fields.some((field, index) => field.position !== index) ? 0 : fields.length;
  return fields.flatMap((field, index) =>
    field.position === index + offset
      ? []
      : [{ operation: "putField" as const, field: { ...omit(field, "publishedSummary"), position: index + offset } }],
  );
}

export function archiveListOperations(
  model: RecordModelView,
  typeId: string,
  archived: boolean,
): ConfigurationChange["operations"] {
  const archivedTypes = new Set(model.types.filter((type) => type.archived).map((type) => type.id));
  return [
    ...model.activityPaths
      .filter((path) => path.typeId === typeId && path.archived !== archived)
      .map((path) => ({ operation: "putActivityPath" as const, activityPath: { ...path, archived } })),
    ...model.relationships
      .filter(
        (relation) =>
          (relation.sourceTypeId === typeId || relation.targetTypeId === typeId) &&
          relation.archived !== archived &&
          (archived ||
            [relation.sourceTypeId, relation.targetTypeId].every((id) => id === typeId || !archivedTypes.has(id))),
      )
      .map((relation) => ({ operation: "putRelationship" as const, relationship: { ...relation, archived } })),
  ];
}

function relatedExpression(
  expression: CalculationExpression,
): Extract<CalculationExpression, { kind: "related" }> | null {
  if (expression.kind === "related") return expression;
  if (expression.kind !== "operation") return null;
  for (const argument of expression.arguments) {
    const related = relatedExpression(argument);
    if (related) return related;
  }
  return null;
}

export function configureFieldSource(model: RecordModelView, field: RecordFieldView): ConfigureFieldSource {
  const behavior = field.behavior;
  if (behavior.kind !== "lookup" && behavior.kind !== "rollup") return { kind: behavior.kind };
  const related = behavior.expression && relatedExpression(behavior.expression);
  const relation = related && model.relationships.find((candidate) => candidate.id === related.relationId);
  const listId = relation ? (related.direction === "outgoing" ? relation.targetTypeId : relation.sourceTypeId) : null;
  return {
    kind: behavior.kind,
    list: model.types.find((type) => type.id === listId)?.pluralLabel ?? null,
  };
}

export function configurePathLists(
  model: RecordModelView,
  typeId: string,
  path: ReadonlyArray<{ relationId: string; direction: "incoming" | "outgoing" }>,
): string[] {
  const lists: string[] = [];
  for (const step of path) {
    const relation = model.relationships.find((candidate) => candidate.id === step.relationId);
    if (!relation) return [];
    const next = step.direction === "outgoing" ? relation.targetTypeId : relation.sourceTypeId;
    const label = model.types.find((type) => type.id === next)?.pluralLabel;
    if (!label) return [];
    lists.push(label);
  }
  return lists;
}
