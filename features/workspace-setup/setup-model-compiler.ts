import type { z } from "zod";
import type { ChipColor } from "@/constants/chip-colors";
import type { ConfigurationChange } from "@/features/records/configuration.schema";
import type { RecordField, RecordModel, RecordType } from "@/features/records/record-model.schema";
import type { SetupExpression, SetupOption, SetupPlan } from "./setup-plan.schema";
import type { SetupCompileIssue, SetupCompileResult } from "./setup-references";

import { PublicConfigurationChangeSchema } from "@/features/records/configuration.schema";
import { presetId } from "@/features/records/crm-preset";

import {
  SETUP_PRESET_FIELDS,
  SETUP_PRESET_RELATIONSHIPS,
  isSetupPresetField,
  isSetupPresetList,
} from "./setup-preset-keys";
import {
  presetOptionId,
  setupFieldReference,
  setupIdempotencyKey,
  setupListReference,
  setupNameReference,
  setupRelationshipReference,
} from "./setup-references";

type ConfigurationInput = z.input<typeof PublicConfigurationChangeSchema>;
type Operation = ConfigurationInput["operations"][number];
type FieldDefinition = Extract<Operation, { operation: "putField" }>["field"];
type Expression = NonNullable<Extract<FieldDefinition["behavior"], { expression?: unknown }>["expression"]>;

export type SetupModelContext = {
  companyId: string;
  setupId: string;
  model: RecordModel;
  brandChip?: ChipColor | null;
  listGrants?: Array<{ roleId: string; actions: Array<"create" | "readOwn" | "readAll" | "update" | "delete"> }>;
};

const PROBABILITY = "probability";

function probability(field: Pick<RecordField, "options">): boolean {
  return field.options.some((option) => option.attributes.some((attribute) => attribute.key === PROBABILITY));
}

function weightOf(option: RecordField["options"][number]): number | undefined {
  const value = option.attributes.find((attribute) => attribute.key === PROBABILITY)?.value;
  return value?.kind === "decimal" ? Number(value.value) : undefined;
}

function optionColor(
  option: SetupOption,
  index: number,
  count: number,
  existing: string | null | undefined,
): ChipColor {
  if (option.color) return option.color;
  if (option.outcome === "won") return "success";
  if (option.outcome === "lost") return "destructive";
  if (existing) return existing as ChipColor;
  if (index === 0) return "secondary";
  return index < count / 2 ? "info" : "warning";
}

function optionWeight(option: SetupOption, index: number, open: number): number {
  if (option.weight !== undefined) return option.weight;
  if (option.outcome === "won") return 100;
  if (option.outcome === "lost") return 0;
  return Math.round(((index + 1) / (open + 1)) * 90);
}

function withoutState(field: RecordField): FieldDefinition {
  const definition: Record<string, unknown> = { ...field };
  delete definition.archived;
  delete definition.publishedSummary;
  return definition as FieldDefinition;
}

function withoutTypeState(type: RecordType): Extract<Operation, { operation: "putType" }>["type"] {
  const definition: Record<string, unknown> = { ...type };
  delete definition.archived;
  return definition as Extract<Operation, { operation: "putType" }>["type"];
}

export function compileSetupRecordModel(
  plan: SetupPlan,
  context: SetupModelContext,
): SetupCompileResult<ConfigurationChange> {
  const { companyId, model } = context;
  const issues: SetupCompileIssue[] = [];
  const fail = (code: string, path: string) => {
    issues.push({ code, path });
    return undefined;
  };
  const planLists = new Map(plan.recordModel.lists.map((list) => [list.key, list]));
  const resolveList = (key: string): string | undefined => {
    if (planLists.has(key)) return setupListReference(key);
    const id = presetId(companyId, key);
    return isSetupPresetList(key) && model.types.some((type) => type.id === id && !type.archived) ? id : undefined;
  };
  const typeId = (key: string, path: string): string | undefined => resolveList(key) ?? fail("unknown_list", path);
  const planned = new Set([
    ...plan.recordModel.fields.map((field) => field.key),
    ...plan.recordModel.calculations.map((field) => field.key),
  ]);
  const presetField = (ref: string) => {
    const id = presetId(companyId, SETUP_PRESET_FIELDS[ref]);
    return model.fields.find((field) => field.id === id && !field.archived);
  };
  const fieldId = (ref: string, path: string): string | undefined => {
    const [list, name] = ref.split(".");
    if (planLists.has(list) && name === "name") return setupNameReference(list);
    if (planned.has(ref)) return setupFieldReference(ref);
    if (isSetupPresetField(ref)) return presetField(ref)?.id ?? fail("unknown_field", path);
    return fail("unknown_field", path);
  };
  const fieldList = (ref: string) => ref.split(".")[0];
  const relationshipId = (ref: string, path: string): string | undefined => {
    if (plan.recordModel.relationships.some((relation) => relation.key === ref)) return setupRelationshipReference(ref);
    const id = presetId(companyId, ref);
    return (SETUP_PRESET_RELATIONSHIPS as readonly string[]).includes(ref) &&
      model.relationships.some((relation) => relation.id === id && !relation.archived)
      ? id
      : fail("unknown_relationship", path);
  };
  const compileExpression = (expression: SetupExpression, path: string): Expression | undefined => {
    switch (expression.op) {
      case "field": {
        const id = fieldId(expression.field, path);
        return id ? { kind: "field", fieldId: id } : undefined;
      }
      case "number":
        return { kind: "literal", value: { kind: "decimal", value: expression.value, currency: null } };
      case "optionWeight": {
        const id = fieldId(expression.field, path);
        return id ? { kind: "optionAttribute", fieldId: id, attribute: PROBABILITY } : undefined;
      }
      case "daysBetween": {
        const from = fieldId(expression.from, path);
        const to = fieldId(expression.to, path);
        return from && to
          ? {
              kind: "operation",
              operator: "daysBetween",
              arguments: [
                { kind: "field", fieldId: from },
                { kind: "field", fieldId: to },
              ],
            }
          : undefined;
      }
      case "related": {
        const relationId = relationshipId(expression.relationship, path);
        const id = fieldId(expression.field, path);
        return relationId && id
          ? {
              kind: "related",
              relationId,
              direction: expression.direction,
              expression: { kind: "field", fieldId: id },
              reducer: expression.reducer,
            }
          : undefined;
      }
      default: {
        const left = compileExpression(expression.left, path);
        const right = compileExpression(expression.right, path);
        return left && right ? { kind: "operation", operator: expression.op, arguments: [left, right] } : undefined;
      }
    }
  };

  const operations: Operation[] = [];
  const nextPosition = Math.max(-1, ...model.types.map((type) => type.position)) + 1;
  plan.recordModel.lists.forEach((list, index) => {
    const reference = setupListReference(list.key);
    operations.push({
      operation: "createType",
      reference,
      label: list.label,
      pluralLabel: list.pluralLabel,
      description: list.description,
      icon: list.icon,
      embedded: false,
      accessPresetId: null,
    });
    const color = list.color ?? context.brandChip ?? undefined;
    if (color) {
      operations.push({
        operation: "putType",
        type: {
          id: reference,
          label: list.label,
          pluralLabel: list.pluralLabel,
          description: list.description,
          icon: list.icon,
          color,
          primaryFieldId: setupNameReference(list.key),
          parentRelationshipId: null,
          embedded: false,
          navigationVisible: true,
          position: nextPosition + index,
        },
      });
    }
  });

  if (context.listGrants?.length) {
    for (const list of plan.recordModel.lists)
      operations.push({ operation: "setTypeGrants", typeId: setupListReference(list.key), grants: context.listGrants });
  }

  const labels = new Map(model.types.map((type) => [type.id, { label: type.label, plural: type.pluralLabel }]));
  const renamed = new Map<string, { label: string; plural: string }>();
  plan.recordModel.listChanges.forEach((change, index) => {
    const id = typeId(change.list, `recordModel.listChanges.${index}`);
    const current = model.types.find((type) => type.id === id);
    if (!current) return;
    const next = {
      ...withoutTypeState(current),
      ...(change.label ? { label: change.label } : {}),
      ...(change.pluralLabel ? { pluralLabel: change.pluralLabel } : {}),
      ...(change.icon ? { icon: change.icon } : {}),
      ...(change.color ? { color: change.color } : {}),
    };
    operations.push({ operation: "putType", type: next });
    renamed.set(current.id, { label: next.label, plural: next.pluralLabel });
  });

  for (const relation of model.relationships) {
    if (relation.archived) continue;
    const end = (typeIdValue: string, cardinality: "one" | "many", label: string) => {
      const before = labels.get(typeIdValue);
      const after = renamed.get(typeIdValue);
      if (!before || !after) return label;
      if (label === before.label && cardinality === "one") return after.label;
      if (label === before.plural && cardinality === "many") return after.plural;
      return label;
    };
    const sourceLabel = end(relation.targetTypeId, relation.sourceCardinality, relation.sourceLabel);
    const targetLabel = end(relation.sourceTypeId, relation.targetCardinality, relation.targetLabel);
    if (sourceLabel === relation.sourceLabel && targetLabel === relation.targetLabel) continue;
    const definition: Record<string, unknown> = { ...relation, sourceLabel, targetLabel };
    delete definition.archived;
    operations.push({
      operation: "putRelationship",
      relationship: definition as Extract<Operation, { operation: "putRelationship" }>["relationship"],
    });
  }

  plan.recordModel.relationships.forEach((relation, index) => {
    const path = `recordModel.relationships.${index}`;
    const sourceTypeId = typeId(relation.source, path);
    const targetTypeId = typeId(relation.target, path);
    if (!sourceTypeId || !targetTypeId) return;
    operations.push({
      operation: "putRelationship",
      relationship: {
        id: setupRelationshipReference(relation.key),
        sourceTypeId,
        targetTypeId,
        sourceLabel: relation.sourceLabel,
        targetLabel: relation.targetLabel,
        sourceCardinality: relation.sourceCardinality,
        targetCardinality: relation.targetCardinality,
        onSourceDelete: "unlink",
        onTargetDelete: "unlink",
      },
    });
  });

  const definitions = new Map<string, FieldDefinition>();
  const changed = new Set<string>();
  const currencyFormat = (format: FieldDefinition["format"]) => ({
    ...(format ?? {}),
    currency: plan.workspace.currency,
  });

  for (const field of model.fields) {
    if (field.archived || !model.types.some((type) => type.id === field.typeId && !type.archived)) continue;
    const definition = withoutState(field);
    if (field.valueType === "currency" && field.format?.currency !== plan.workspace.currency) {
      definition.format = currencyFormat(field.format);
      changed.add(field.id);
    }
    if (
      field.behavior.kind === "input" &&
      field.behavior.defaultValue?.kind === "decimal" &&
      field.behavior.defaultValue.currency &&
      field.behavior.defaultValue.currency !== plan.workspace.currency
    ) {
      definition.behavior = {
        kind: "input",
        defaultValue: { ...field.behavior.defaultValue, currency: plan.workspace.currency },
      };
      changed.add(field.id);
    }
    definitions.set(field.id, definition);
  }

  plan.recordModel.fieldChanges.forEach((change, index) => {
    const path = `recordModel.fieldChanges.${index}`;
    const current = presetField(change.field);
    if (!current) return fail("unknown_field", path);
    const definition = definitions.get(current.id);
    if (!definition) return fail("unknown_field", path);
    if (change.label) definition.label = change.label;
    if (change.options) {
      if (current.valueType !== "select") return fail("options_need_choice_field", path);
      const weighted = probability(current);
      const open = change.options.filter((option) => !option.outcome || option.outcome === "open").length;
      let openIndex = 0;
      definition.options = change.options.map((option, position) => {
        const id = presetOptionId(companyId, current, SETUP_PRESET_FIELDS[change.field], option.key) ?? option.key;
        const existing = current.options.find((candidate) => candidate.id === id);
        const isOpen = !option.outcome || option.outcome === "open";
        const weight = weighted
          ? (option.weight ??
            (existing && !option.outcome ? weightOf(existing) : undefined) ??
            optionWeight(option, openIndex, open))
          : option.weight;
        if (isOpen) openIndex++;
        return {
          id,
          label: option.label,
          color: optionColor(option, position, change.options?.length ?? 0, existing?.color),
          attributes: [
            ...(existing?.attributes.filter((attribute) => attribute.key !== PROBABILITY) ?? []),
            ...(weight === undefined
              ? []
              : [{ key: PROBABILITY, value: { kind: "decimal" as const, value: String(weight), currency: null } }]),
          ],
        };
      });
      const behavior = definition.behavior;
      if (
        behavior.kind === "input" &&
        behavior.defaultValue?.kind === "select" &&
        !definition.options.some((option) => option.id === behavior.defaultValue?.value)
      )
        definition.behavior = { kind: "input", defaultValue: { kind: "select", value: definition.options[0].id } };
    }
    changed.add(current.id);
  });

  const added: string[] = [];
  plan.recordModel.fields.forEach((field, index) => {
    const list = typeId(fieldList(field.key), `recordModel.fields.${index}`);
    if (!list) return;
    const ref = setupFieldReference(field.key);
    added.push(ref);
    definitions.set(ref, {
      id: ref,
      typeId: list,
      label: field.label,
      valueType: field.valueType,
      behavior: { kind: "input" },
      required: field.required,
      ...(field.multiple ? { multiple: true } : {}),
      ...(field.valueType === "currency" ? { format: { currency: plan.workspace.currency } } : {}),
      options: field.options.map((option, position) => ({
        id: option.key,
        label: option.label,
        color: optionColor(option, position, field.options.length, null),
        attributes:
          option.weight === undefined
            ? []
            : [{ key: PROBABILITY, value: { kind: "decimal" as const, value: String(option.weight), currency: null } }],
      })),
      position: 0,
    });
  });
  plan.recordModel.calculations.forEach((field, index) => {
    const path = `recordModel.calculations.${index}`;
    const list = typeId(fieldList(field.key), path);
    const expression = compileExpression(field.expression, path);
    if (!list || !expression) return;
    const ref = setupFieldReference(field.key);
    added.push(ref);
    const kind =
      field.expression.op === "related" ? (field.expression.reducer === "one" ? "lookup" : "rollup") : "formula";
    definitions.set(ref, {
      id: ref,
      typeId: list,
      label: field.label,
      valueType: field.valueType,
      behavior: { kind, expression },
      required: false,
      ...(field.valueType === "currency" ? { format: { currency: plan.workspace.currency } } : {}),
      options: [],
      position: 0,
    });
  });

  const lists = [
    ...model.types.filter((type) => !type.archived).map((type) => ({ id: type.id, planned: false })),
    ...plan.recordModel.lists.map((list) => ({ id: setupListReference(list.key), planned: true })),
  ];
  for (const list of lists) {
    const existing = model.fields
      .filter((field) => field.typeId === list.id && definitions.has(field.id))
      .sort((left, right) => left.position - right.position)
      .map((field) => field.id);
    const fresh = added.filter((ref) => definitions.get(ref)?.typeId === list.id);
    const defaultIndex = plan.listDefaults.findIndex((value) => resolveList(value.list) === list.id);
    let order: string[];
    let start: number;
    if (defaultIndex >= 0) {
      const columns = plan.listDefaults[defaultIndex].columns.flatMap((column, index) => {
        const path = `listDefaults.${defaultIndex}.columns.${index}`;
        if (resolveList(fieldList(column)) !== list.id) return fail("column_outside_list", path) ?? [];
        return fieldId(column, path) ?? [];
      });
      const primary = model.types.find((type) => type.id === list.id)?.primaryFieldId;
      order = [...new Set([...(primary ? [primary] : []), ...columns, ...existing, ...fresh])];
      start = list.planned ? 1 : 0;
    } else {
      order = fresh;
      start = Math.max(list.planned ? 0 : -1, ...existing.map((id) => definitions.get(id)?.position ?? 0)) + 1;
    }
    order
      .filter((id) => definitions.has(id))
      .forEach((id, index) => {
        const definition = definitions.get(id);
        if (!definition || definition.position === start + index) return;
        definition.position = start + index;
        if (!added.includes(id)) changed.add(id);
      });
  }

  if (issues.length) return { ok: false, issues };
  for (const [id, definition] of definitions)
    if (changed.has(id) || added.includes(id)) operations.push({ operation: "putField", field: definition });

  const parsed = PublicConfigurationChangeSchema.safeParse({
    expectedRevision: model.revision,
    idempotencyKey: setupIdempotencyKey(context.setupId, "record-model"),
    operations,
  } satisfies ConfigurationInput);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({ code: "invalid_bundle", path: issue.path.join(".") })),
    };
  }
  return { ok: true, data: parsed.data };
}
