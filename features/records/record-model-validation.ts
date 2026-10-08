import { resolveRecordGrouping } from "./record-grouping";
import { z } from "zod";

import type {
  CalculationExpression,
  RecordField,
  RecordModel,
  RecordScalar,
  RecordValueType,
} from "./record-model.schema";

import { RecordDateTimeSchema } from "./record-model.schema";

import { isRepresentableDecimal } from "./calculation";
import { recordColumns } from "./record-columns";
import { recordInstantMicros } from "./record-instant";
import { resolveRecordPath } from "./record-relationship-path";

export type ModelIssue = {
  code: string;
  fieldId?: string;
  typeId?: string;
  relationId?: string;
};

export const MULTIPLE_VALUE_TYPES: readonly RecordValueType[] = ["text", "email", "phone", "url", "select"];
export const CONTACT_VALUE_TYPES: readonly RecordValueType[] = ["email", "phone", "url"];

export function selectedOptionIds(value: RecordScalar | null): string[] {
  if (!value) return [];
  if (value.kind === "select") return [value.value];
  if (value.kind === "selectList") return value.value;
  return [];
}

export function scalarMatchesType(value: RecordScalar, type: RecordValueType, multiple = false): boolean {
  if (multiple && type === "select") return value.kind === "selectList";
  if (multiple) {
    return (
      value.kind === "textList" &&
      ["text", "email", "phone", "url"].includes(type) &&
      value.value.every((text) => scalarMatchesType({ kind: "text", value: text }, type))
    );
  }
  switch (type) {
    case "number":
      return value.kind === "decimal" && value.currency === null && isRepresentableDecimal(value.value);
    case "currency":
      return value.kind === "decimal" && value.currency !== null && isRepresentableDecimal(value.value);
    case "email":
      return value.kind === "text" && z.email().safeParse(value.value.trim()).success;
    case "url": {
      if (value.kind !== "text") return false;
      try {
        return ["http:", "https:"].includes(new URL(value.value).protocol);
      } catch {
        return false;
      }
    }
    case "phone":
      return value.kind === "text" && z.e164().safeParse(value.value.trim()).success;
    case "dateRange":
    case "dateTimeRange": {
      if (value.kind !== "range") return false;
      const values = [value.start, value.end].filter((entry): entry is string => entry !== null);
      const schema = type === "dateRange" ? z.union([z.iso.date(), RecordDateTimeSchema]) : RecordDateTimeSchema;
      if (values.some((entry) => !schema.safeParse(entry).success)) return false;
      return !value.start || !value.end || recordInstantMicros(value.start) <= recordInstantMicros(value.end);
    }
    default:
      return value.kind === type;
  }
}

export function expressionFieldDependencies(expression: CalculationExpression): Set<string> {
  if (expression.kind === "field" || expression.kind === "optionAttribute") return new Set([expression.fieldId]);
  if (expression.kind === "related") return expressionFieldDependencies(expression.expression);
  if (expression.kind === "operation")
    return new Set(expression.arguments.flatMap((argument) => [...expressionFieldDependencies(argument)]));
  return new Set();
}

export function expressionRelationshipDependencies(expression: CalculationExpression): Set<string> {
  if (expression.kind === "related")
    return new Set([expression.relationId, ...expressionRelationshipDependencies(expression.expression)]);
  if (expression.kind === "operation")
    return new Set(expression.arguments.flatMap((argument) => [...expressionRelationshipDependencies(argument)]));
  return new Set();
}

function primitiveType(value: RecordScalar | null): RecordValueType | null {
  if (!value) return null;
  if (value.kind === "decimal") return value.currency ? "currency" : "number";
  if (value.kind === "range") return "dateRange";
  if (value.kind === "textList") return "text";
  if (value.kind === "selectList") return null;
  return value.kind;
}

function normalizeType(value: RecordValueType | null): RecordValueType | null {
  return value && ["email", "phone", "url"].includes(value) ? "text" : value;
}

export function validateRecordModel(model: RecordModel): {
  issues: ModelIssue[];
  calculationOrder: string[];
} {
  const issues: ModelIssue[] = [];
  const types = new Map(model.types.map((type) => [type.id, type]));
  const fields = new Map(model.fields.map((field) => [field.id, field]));
  const relations = new Map(model.relationships.map((relation) => [relation.id, relation]));
  if (
    types.size !== model.types.length ||
    fields.size !== model.fields.length ||
    relations.size !== model.relationships.length
  )
    issues.push({ code: "duplicate_definition_id" });

  const expressionType = (
    expression: CalculationExpression,
    typeId: string,
    owner: RecordField,
  ): RecordValueType | null => {
    const invalid = (code: string) => {
      issues.push({ code, fieldId: owner.id });
      return null;
    };
    if (expression.kind === "literal") return primitiveType(expression.value);
    if (expression.kind === "field" || expression.kind === "optionAttribute") {
      const field = fields.get(expression.fieldId);
      if (!field || field.archived || field.typeId !== typeId) return invalid("invalid_field_reference");
      if (field.valueType === "select" && field.multiple) return invalid("multiple_choice_not_calculable");
      if (expression.kind === "field") return normalizeType(field.valueType);
      if (field.valueType !== "select") return invalid("option_attribute_requires_select");
      const attributeTypes = new Set(
        field.options.flatMap((option) =>
          option.attributes
            .filter((attribute) => attribute.key === expression.attribute)
            .map((attribute) => primitiveType(attribute.value)),
        ),
      );
      if (attributeTypes.size > 1) return invalid("option_attribute_type_mismatch");
      return [...attributeTypes][0] ?? null;
    }
    if (expression.kind === "related") {
      const relation = relations.get(expression.relationId);
      if (!relation || relation.archived) return invalid("invalid_relationship_reference");
      const outgoing = expression.direction === "outgoing";
      if ((outgoing ? relation.sourceTypeId : relation.targetTypeId) !== typeId)
        return invalid("invalid_relationship_direction");
      if (
        expression.reducer === "one" &&
        (outgoing ? relation.sourceCardinality : relation.targetCardinality) !== "one"
      )
        return invalid("lookup_requires_singular_relationship");
      const result = expressionType(
        expression.expression,
        outgoing ? relation.targetTypeId : relation.sourceTypeId,
        owner,
      );
      if (expression.reducer === "count") return "number";
      if (["sum", "average"].includes(expression.reducer) && result && !["number", "currency"].includes(result))
        return invalid("numeric_aggregation_required");
      return result;
    }
    const args = expression.arguments.map((argument) => expressionType(argument, typeId, owner));
    const operator = expression.operator;
    const required =
      operator === "if"
        ? 3
        : ["not", "lower", "upper", "trim"].includes(operator)
          ? 1
          : ["coalesce", "concat", "and", "or"].includes(operator)
            ? null
            : 2;
    if ((required !== null && args.length !== required) || args.length === 0) return invalid("invalid_argument_count");
    if (operator === "if") {
      if (args[0] !== "boolean" || (args[1] && args[2] && args[1] !== args[2]))
        return invalid("conditional_type_mismatch");
      return args[1] ?? args[2];
    }
    if (operator === "coalesce") {
      const concrete = new Set(args.filter(Boolean));
      if (concrete.size > 1) return invalid("coalesce_type_mismatch");
      return args.find(Boolean) ?? null;
    }
    if (["equal", "lessThan", "greaterThan"].includes(operator)) {
      if (args[0] && args[1] && args[0] !== args[1]) return invalid("comparison_type_mismatch");
      return "boolean";
    }
    if (["and", "or", "not"].includes(operator)) {
      if (args.some((type) => type && type !== "boolean")) return invalid("boolean_argument_required");
      return "boolean";
    }
    if (["concat", "lower", "upper", "trim"].includes(operator)) {
      if (args.some((type) => type && type !== "text")) return invalid("text_argument_required");
      return "text";
    }
    if (operator === "daysBetween") {
      if (
        args.some((type) => type && !["date", "dateTime"].includes(type)) ||
        (args[0] && args[1] && args[0] !== args[1])
      )
        return invalid("date_argument_required");
      return "number";
    }
    if (args.some((type) => type && !["number", "currency"].includes(type)))
      return invalid("numeric_argument_required");
    if ((operator === "add" || operator === "subtract") && args[0] && args[1] && args[0] !== args[1])
      return invalid("currency_type_mismatch");
    if (operator === "multiply" && args.every((type) => type === "currency")) return invalid("currency_type_mismatch");
    if (operator === "divide" && args[1] === "currency")
      return args[0] === "currency" ? "number" : invalid("currency_type_mismatch");
    return args.includes("currency") ? "currency" : "number";
  };

  for (const type of model.types) {
    const paths = type.relationshipPaths ?? [];
    if (new Set(paths.map((path) => path.id)).size !== paths.length)
      issues.push({ code: "duplicate_definition_id", typeId: type.id });
    if (type.archived) continue;
    for (const path of paths) {
      if (path.archived) continue;
      const steps = resolveRecordPath(type.id, path.path, model);
      if (!steps || steps.some((step) => !types.has(step.typeId) || types.get(step.typeId)?.archived))
        issues.push({ code: "invalid_relationship_path", typeId: type.id });
    }
    const primary = fields.get(type.primaryFieldId);
    if (!primary || primary.typeId !== type.id || primary.archived || primary.valueType !== "text")
      issues.push({ code: "invalid_primary_field", typeId: type.id });
    const columns = new Set(recordColumns(type.id, model).map((column) => column.id));
    for (const id of [...type.defaults.columns, ...type.defaults.hiddenColumns, ...type.defaults.pinnedFields]) {
      if (!columns.has(id)) {
        issues.push({
          code: "invalid_layout_field",
          typeId: type.id,
          fieldId: id,
        });
      }
    }
  }
  for (const type of model.types) {
    if (type.archived) continue;
    const summaries = new Set<string>();
    for (const summary of type.defaults.groupSummaries ?? []) {
      const field = fields.get(summary.fieldId);
      const key = `${summary.fieldId}:${summary.aggregation}`;
      if (
        !field ||
        field.typeId !== type.id ||
        field.archived ||
        !["number", "currency"].includes(field.valueType) ||
        summaries.has(key)
      ) {
        issues.push({
          code: "invalid_layout_field",
          typeId: type.id,
          fieldId: summary.fieldId,
        });
      }
      summaries.add(key);
    }
    if (type.defaults.hiddenColumns.includes(type.primaryFieldId))
      issues.push({ code: "primary_field_hidden", typeId: type.id });
    if (
      type.defaults.groupBy &&
      !resolveRecordGrouping(type.id, { field: type.defaults.groupBy, bucket: type.defaults.groupBucket }, model)
    ) {
      issues.push({
        code: "invalid_grouping_field",
        typeId: type.id,
        fieldId: type.defaults.groupBy,
      });
    }
    if (!type.defaults.groupBy && type.defaults.groupBucket)
      issues.push({ code: "invalid_grouping_field", typeId: type.id });
    if (
      type.defaults.sortField &&
      !recordColumns(type.id, model).some((column) => column.id === type.defaults.sortField && column.sortable)
    ) {
      issues.push({
        code: "invalid_sort_field",
        typeId: type.id,
        fieldId: type.defaults.sortField,
      });
    }
  }
  for (const type of model.types) {
    if (type.archived) continue;
    const visited = new Set<string>();
    let current = type;
    while (current.parentRelationshipId) {
      if (visited.has(current.id) || visited.size >= 12) {
        issues.push({ code: "parent_access_cycle_or_depth", typeId: type.id });
        break;
      }
      visited.add(current.id);
      const relation = relations.get(current.parentRelationshipId);
      const parent = relation && types.get(relation.targetTypeId);
      if (
        !relation ||
        relation.archived ||
        relation.sourceTypeId !== current.id ||
        relation.sourceCardinality !== "one" ||
        !parent ||
        parent.archived ||
        relation.onTargetDelete === "unlink"
      ) {
        issues.push({
          code: "invalid_parent_relationship",
          typeId: type.id,
          relationId: current.parentRelationshipId,
        });
        break;
      }
      current = parent;
    }
  }
  for (const relation of model.relationships) {
    if (!types.has(relation.sourceTypeId) || !types.has(relation.targetTypeId)) {
      issues.push({
        code: "invalid_relationship_type",
        relationId: relation.id,
      });
    }
    if (
      !relation.archived &&
      (types.get(relation.sourceTypeId)?.archived || types.get(relation.targetTypeId)?.archived)
    ) {
      issues.push({
        code: "archived_relationship_type",
        relationId: relation.id,
      });
    }
  }
  for (const preset of model.accessPresets) {
    if (new Set(preset.grants.map((grant) => grant.roleId)).size !== preset.grants.length)
      issues.push({ code: "duplicate_grant_role" });
  }

  const channelTypes = new Set<string>();
  for (const binding of model.capabilities) {
    if (binding.kind === "channels") {
      if (channelTypes.has(binding.typeId)) {
        issues.push({
          code: "duplicate_channels_capability",
          typeId: binding.typeId,
        });
      }
      channelTypes.add(binding.typeId);
    }
    if (binding.kind !== "channels" && (binding.enabled !== undefined || binding.providerAvatar !== undefined)) {
      issues.push({
        code: "invalid_capability_options",
        typeId: binding.typeId,
      });
    }
    const type = types.get(binding.typeId);
    if (!type || (type.archived && binding.kind === "membershipAuthorization"))
      issues.push({ code: "capability_requires_type", typeId: binding.typeId });
    if (binding.kind === "membershipAuthorization" && type?.embedded)
      issues.push({ code: "capability_requires_type", typeId: binding.typeId });
    if (new Set(binding.fields.map((field) => field.role)).size !== binding.fields.length) {
      issues.push({
        code: "duplicate_capability_role",
        typeId: binding.typeId,
      });
    }
    for (const reference of binding.fields) {
      const field = fields.get(reference.fieldId);
      const expectedType = binding.kind === "avatar" ? "url" : binding.kind === "calendar" ? "dateTimeRange" : "text";
      if (
        !field ||
        field.archived ||
        field.typeId !== binding.typeId ||
        field.valueType !== expectedType ||
        (binding.kind === "channels" && field.behavior.kind !== "input")
      ) {
        issues.push({
          code: "capability_requires_field",
          fieldId: reference.fieldId,
        });
      }
    }
  }
  for (const field of model.fields) {
    if (field.multiple && !MULTIPLE_VALUE_TYPES.includes(field.valueType))
      issues.push({ code: "invalid_multiple_value_type", fieldId: field.id });
    if (field.valueType === "select" && field.multiple && field.behavior.kind !== "input")
      issues.push({ code: "multiple_choice_requires_input", fieldId: field.id });
    if (!types.has(field.typeId)) issues.push({ code: "invalid_field_type", fieldId: field.id });
    if (new Set(field.options.map((option) => option.id)).size !== field.options.length)
      issues.push({ code: "duplicate_option_id", fieldId: field.id });
    if (field.valueType === "currency" && !field.format?.currency)
      issues.push({ code: "missing_currency", fieldId: field.id });
    if (field.format?.onClick && !CONTACT_VALUE_TYPES.includes(field.valueType))
      issues.push({ code: "invalid_click_action", fieldId: field.id });
    if (field.behavior.kind === "input") {
      if (
        field.behavior.defaultValue &&
        (!scalarMatchesType(field.behavior.defaultValue, field.valueType, field.multiple) ||
          !selectedOptionIds(field.behavior.defaultValue).every((id) =>
            field.options.some((option) => option.id === id),
          ))
      )
        issues.push({ code: "invalid_default", fieldId: field.id });
      continue;
    }
    if (field.archived || types.get(field.typeId)?.archived) continue;
    if (field.behavior.kind === "snapshot" && field.behavior.capture === "whenChanged") {
      const trigger = fields.get(field.behavior.triggerFieldId ?? "");
      if (
        !trigger ||
        trigger.typeId !== field.typeId ||
        trigger.archived ||
        trigger.behavior.kind !== "input" ||
        trigger.multiple ||
        !field.behavior.triggerValue ||
        !scalarMatchesType(field.behavior.triggerValue, trigger.valueType)
      )
        issues.push({ code: "invalid_snapshot_trigger", fieldId: field.id });
    }
    const inferred = expressionType(field.behavior.expression, field.typeId, field);
    if (inferred && inferred !== normalizeType(field.valueType)) {
      issues.push({
        code: "calculation_result_type_mismatch",
        fieldId: field.id,
      });
    }
  }
  const calculationOrder: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string, depth = 0) => {
    if (depth > 64) {
      issues.push({ code: "calculation_dependency_depth", fieldId: id });
      return;
    }
    if (visiting.has(id)) {
      issues.push({ code: "calculation_cycle", fieldId: id });
      return;
    }
    if (visited.has(id)) return;
    const field = fields.get(id);
    if (!field || field.archived || field.behavior.kind === "input") return;
    visiting.add(id);
    for (const dependency of expressionFieldDependencies(field.behavior.expression)) visit(dependency, depth + 1);
    visiting.delete(id);
    visited.add(id);
    calculationOrder.push(id);
  };
  for (const field of model.fields) visit(field.id);
  return { issues, calculationOrder };
}
