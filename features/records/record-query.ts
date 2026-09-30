import { Prisma } from "@/generated/prisma";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { RecordWriteError } from "./record-write.service";

import type { CalculationExpression, RecordField, RecordModel, RecordScalar } from "./record-model.schema";
import type { RecordAccessMap, RecordQuery, RecordReadScope } from "./record-query.schema";
import { RecordSystemColumnSchema } from "./record-column.schema";
import { RecordQuerySchema } from "./record-query.schema";
import { isTemporalRecordType } from "./record-temporal-filter";
import { recordCollation } from "./record-collation";

function alias(index: number): Prisma.Sql {
  return Prisma.raw(`"record_${index}"`);
}

export function recordReadPredicate(
  companyId: string,
  scope: RecordReadScope,
  record: Prisma.Sql,
  depth = 0,
): Prisma.Sql {
  if (scope.parent) {
    const parent = Prisma.raw(`"access_parent_${depth}"`);
    const link = Prisma.raw(`"access_link_${depth}"`);
    return Prisma.sql`EXISTS (SELECT 1 FROM "RecordLink" ${link} JOIN "CrmRecord" ${parent} ON ${parent}."companyId" = ${companyId} AND ${parent}."typeId" = ${scope.parent.typeId} AND ${parent}.id = ${link}."targetId" WHERE ${link}."companyId" = ${companyId} AND ${link}."relationId" = ${scope.parent.relationId} AND ${link}."sourceId" = ${record}.id AND ${recordReadPredicate(companyId, scope.parent.scope, parent, depth + 1)})`;
  }
  if (scope.access === "all") return Prisma.sql`TRUE`;
  if (scope.access === "none") return Prisma.sql`FALSE`;
  return Prisma.sql`EXISTS (SELECT 1 FROM "RecordAssignment" assignment WHERE assignment."companyId" = ${companyId} AND assignment."typeId" = ${record}."typeId" AND assignment."recordId" = ${record}."id" AND assignment."userId" = ${scope.userId})`;
}

export function fieldReadPredicate(
  companyId: string,
  field: RecordField,
  model: RecordModel,
  access: RecordAccessMap,
  root = alias(0),
): Prisma.Sql {
  const fullyReadable = (scope: RecordReadScope | undefined, depth = 0): boolean =>
    Boolean(
      scope && depth <= 12 && scope.access === "all" && (!scope.parent || fullyReadable(scope.parent.scope, depth + 1)),
    );
  if (model.types.every((type) => type.archived || fullyReadable(access.get(type.id)))) return Prisma.sql`TRUE`;
  const fields = new Map(model.fields.map((definition) => [definition.id, definition]));
  const relations = new Map(model.relationships.map((definition) => [definition.id, definition]));
  let sequence = 0;
  const visited = new Map<Prisma.Sql, Set<string>>();
  let cost = 0;
  const capturedPredicate = (definition: RecordField, record: Prisma.Sql): Prisma.Sql => {
    const source = alias(++sequence);
    const dependency = Prisma.raw(`"dependency_${sequence}"`);
    const permitted = [...access]
      .filter(([, scope]) => scope.access !== "none")
      .map(
        ([typeId, scope]) =>
          Prisma.sql`(${source}."typeId" = ${typeId} AND ${recordReadPredicate(companyId, scope, source)})`,
      );
    return Prisma.sql`NOT EXISTS (SELECT 1 FROM "RecordValueDependency" ${dependency}
      WHERE ${dependency}."companyId" = ${companyId} AND ${dependency}."typeId" = ${record}."typeId" AND ${dependency}."recordId" = ${record}."id" AND ${dependency}."fieldId" = ${definition.id}
      AND NOT EXISTS (SELECT 1 FROM "CrmRecord" ${source} WHERE ${source}."companyId" = ${companyId} AND ${source}."typeId" = ${dependency}."sourceTypeId" AND ${source}."id" = ${dependency}."sourceId" AND (${permitted.length ? Prisma.join(permitted, " OR ") : Prisma.sql`FALSE`})))`;
  };
  const readableField = (definition: RecordField, record: Prisma.Sql): Prisma.Sql => {
    if (++cost > 2048) throw new RecordWriteError(CustomErrorCode.recordCalculationBudget);
    if (definition.publishedSummary) return Prisma.sql`TRUE`;
    const fields = visited.get(record) ?? new Set<string>();
    if (fields.has(definition.id)) return Prisma.sql`TRUE`;
    fields.add(definition.id);
    visited.set(record, fields);
    const captured = capturedPredicate(definition, record);
    if (definition.behavior.kind === "input" || definition.behavior.kind === "snapshot") return captured;
    return Prisma.sql`(${captured} AND ${expressionPredicate(definition.behavior.expression, definition.typeId, record)})`;
  };
  const expressionPredicate = (expression: CalculationExpression, typeId: string, record: Prisma.Sql): Prisma.Sql => {
    if (expression.kind === "literal") return Prisma.sql`TRUE`;
    if (expression.kind === "field" || expression.kind === "optionAttribute") {
      const dependency = fields.get(expression.fieldId);
      if (!dependency || dependency.typeId !== typeId) return Prisma.sql`FALSE`;
      return readableField(dependency, record);
    }
    if (expression.kind === "operation") {
      return Prisma.sql`(${Prisma.join(
        expression.arguments.map((argument) => expressionPredicate(argument, typeId, record)),
        " AND ",
      )})`;
    }
    const relation = relations.get(expression.relationId);
    if (!relation) return Prisma.sql`FALSE`;
    const outgoing = expression.direction === "outgoing";
    const targetTypeId = outgoing ? relation.targetTypeId : relation.sourceTypeId;
    const scope = access.get(targetTypeId);
    const target = alias(++sequence);
    const link = Prisma.raw(`"link_${sequence}"`);
    const sourceId = outgoing ? Prisma.sql`${link}."sourceId"` : Prisma.sql`${link}."targetId"`;
    const targetId = outgoing ? Prisma.sql`${link}."targetId"` : Prisma.sql`${link}."sourceId"`;
    const accessPredicate = scope ? recordReadPredicate(companyId, scope, target) : Prisma.sql`FALSE`;
    const dependencyPredicate = expressionPredicate(expression.expression, targetTypeId, target);
    return Prisma.sql`NOT EXISTS (
      SELECT 1 FROM "RecordLink" ${link}
      JOIN "CrmRecord" ${target} ON ${target}."companyId" = ${companyId} AND ${target}."typeId" = ${targetTypeId} AND ${target}."id" = ${targetId}
      WHERE ${link}."companyId" = ${companyId} AND ${link}."relationId" = ${relation.id} AND ${sourceId} = ${record}."id"
      AND NOT (${accessPredicate} AND ${dependencyPredicate})
    )`;
  };
  return readableField(field, root);
}

function storageColumn(field: RecordField): Prisma.Sql {
  if (field.multiple) return Prisma.sql`array_to_string(value."textListValue", ',')`;
  if (["number", "currency"].includes(field.valueType)) return Prisma.sql`value."decimalValue"`;
  if (["date", "dateTime"].includes(field.valueType)) return Prisma.sql`value."instantValue"`;
  if (field.valueType === "boolean") return Prisma.sql`value."booleanValue"`;
  return Prisma.sql`value."textValue"`;
}

function scalarParameter(value: RecordScalar): Prisma.Sql {
  switch (value.kind) {
    case "decimal":
      return Prisma.sql`${value.value}::numeric`;
    case "boolean":
      return Prisma.sql`${value.value}::boolean`;
    case "date":
    case "dateTime":
      return Prisma.sql`(${value.value}::timestamptz AT TIME ZONE 'UTC')`;
    case "textList":
      throw new Error("Collection filters must use an element value");
    case "range":
    case "richText":
      throw new Error("Range and document query values must be rejected before compilation");
    default:
      return Prisma.sql`${value.value}`;
  }
}

function temporalFilter(filter: RecordQuery["filters"][number], start: Prisma.Sql, end = start): Prisma.Sql {
  if (filter.operator === "inLastDays") {
    if (filter.value?.kind !== "decimal") throw new Error("Relative date filter requires a day count");
    return Prisma.sql`${end} >= date_trunc('day', transaction_timestamp() AT TIME ZONE 'UTC') - ${filter.value.value}::integer * INTERVAL '1 day'`;
  }
  if (filter.operator === "between") {
    const [from, until] = filter.values ?? [];
    if (!from || !until) throw new Error("Date window requires two endpoints");
    return Prisma.sql`(${start} >= ${scalarParameter(from)} AND ${end} <= ${scalarParameter(until)})`;
  }
  if (filter.operator === "in" || filter.operator === "notIn") {
    const choices = filter.values ?? [];
    const matches = choices.length
      ? Prisma.sql`${start} IN (${Prisma.join(choices.map(scalarParameter))})`
      : Prisma.sql`FALSE`;
    return filter.operator === "notIn" ? Prisma.sql`NOT COALESCE(${matches}, FALSE)` : matches;
  }
  if (!filter.value) throw new Error("Date comparison requires a point");
  if (filter.operator === "contains")
    return Prisma.sql`(${start} <= ${scalarParameter(filter.value)} AND ${end} >= ${scalarParameter(filter.value)})`;
  const operators = { eq: "=", ne: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" } as const;
  if (!(filter.operator in operators)) throw new Error("Date filter must be validated before compilation");
  const expression = ["lt", "lte"].includes(filter.operator) ? end : start;
  return Prisma.sql`${expression} ${Prisma.raw(operators[filter.operator as keyof typeof operators])} ${scalarParameter(filter.value)}`;
}

function systemFilter(companyId: string, filter: RecordQuery["filters"][number], record: Prisma.Sql): Prisma.Sql {
  const assigned = filter.fieldId === "system:assignedTo";
  const empty = filter.operator === "empty" || filter.operator === "notEmpty";
  if (assigned) {
    const values = ["in", "notIn"].includes(filter.operator)
      ? (filter.values ?? [])
      : filter.value
        ? [filter.value]
        : [];
    const selection = empty
      ? Prisma.sql`TRUE`
      : values.length
        ? Prisma.sql`assignment."userId" IN (${Prisma.join(values.map(scalarParameter))})`
        : Prisma.sql`FALSE`;
    const exists = Prisma.sql`EXISTS (SELECT 1 FROM "RecordAssignment" assignment WHERE assignment."companyId" = ${companyId} AND assignment."typeId" = ${record}."typeId" AND assignment."recordId" = ${record}.id AND ${selection})`;
    return ["ne", "notIn", "empty"].includes(filter.operator) ? Prisma.sql`NOT (${exists})` : exists;
  }
  const expression =
    filter.fieldId === "system:createdAt" ? Prisma.sql`${record}."createdAt"` : Prisma.sql`${record}."updatedAt"`;
  if (empty) return filter.operator === "empty" ? Prisma.sql`FALSE` : Prisma.sql`TRUE`;
  return temporalFilter(filter, expression);
}

export function compileRecordQuery(
  companyId: string,
  query: RecordQuery,
  model: RecordModel,
  access: RecordAccessMap,
): { ids: Prisma.Sql; count: Prisma.Sql; matching: Prisma.Sql; ordered: Prisma.Sql } {
  const record = alias(0);
  const fields = new Map(
    model.fields.filter((field) => field.typeId === query.typeId && !field.archived).map((field) => [field.id, field]),
  );
  const scope = access.get(query.typeId) ?? {
    userId: "",
    access: "none" as const,
  };
  const scalar = (field: RecordField) =>
    Prisma.sql`(SELECT ${storageColumn(field)} FROM "RecordValue" value WHERE value."companyId" = ${companyId} AND value."typeId" = ${query.typeId} AND value."recordId" = ${record}."id" AND value."fieldId" = ${field.id} AND value."state" = 'value')`;
  const conditions: Prisma.Sql[] = [
    Prisma.sql`${record}."companyId" = ${companyId}`,
    Prisma.sql`${record}."typeId" = ${query.typeId}`,
    recordReadPredicate(companyId, scope, record),
  ];
  if (query.search) {
    const searchable = [...fields.values()].filter((field) =>
      ["text", "email", "phone", "url"].includes(field.valueType),
    );
    const search = `%${query.search.replace(/[\\%_]/g, "\\$&")}%`;
    const matches: Prisma.Sql[] = [];
    const scalarFields = searchable.filter((field) => !field.multiple);
    if (scalarFields.length) {
      const permitted = scalarFields.map(
        (field) =>
          Prisma.sql`(value."fieldId" = ${field.id} AND ${fieldReadPredicate(companyId, field, model, access, record)})`,
      );
      matches.push(Prisma.sql`EXISTS (SELECT 1 FROM "RecordValue" value
        WHERE value."companyId" = ${companyId} AND value."typeId" = ${query.typeId}
          AND value."recordId" = ${record}.id AND value.state = 'value'
          AND value."textValue" ILIKE ${search} AND (${Prisma.join(permitted, " OR ")}))`);
    }
    const collectionFields = searchable.filter((field) => field.multiple);
    if (collectionFields.length) {
      const permitted = collectionFields.map(
        (field) =>
          Prisma.sql`(value."fieldId" = ${field.id} AND ${fieldReadPredicate(companyId, field, model, access, record)})`,
      );
      matches.push(Prisma.sql`EXISTS (SELECT 1 FROM "RecordValue" value
        CROSS JOIN LATERAL UNNEST(value."textListValue") element
        WHERE value."companyId" = ${companyId} AND value."typeId" = ${query.typeId}
          AND value."recordId" = ${record}.id AND value.state = 'value'
          AND element ILIKE ${search} AND (${Prisma.join(permitted, " OR ")}))`);
    }
    if (model.capabilities.some((binding) => binding.kind === "personIdentity" && binding.typeId === query.typeId)) {
      matches.push(Prisma.sql`EXISTS (SELECT 1 FROM "RecordIdentity" identity WHERE identity."companyId" = ${companyId}
        AND identity."typeId" = ${query.typeId} AND identity."recordId" = ${record}.id
        AND (identity.value ILIKE ${search} OR identity."messagingId" ILIKE ${search}))`);
    }
    conditions.push(matches.length ? Prisma.sql`(${Prisma.join(matches, " OR ")})` : Prisma.sql`FALSE`);
  }
  for (const filter of query.filters) {
    if (RecordSystemColumnSchema.safeParse(filter.fieldId).success) {
      conditions.push(systemFilter(companyId, filter, record));
      continue;
    }
    const field = fields.get(filter.fieldId);
    if (!field) throw new Error("Query field must be validated before compilation");
    conditions.push(fieldReadPredicate(companyId, field, model, access, record));
    const expression = scalar(field);
    if (filter.operator === "empty" || filter.operator === "notEmpty") {
      const valueState = Prisma.sql`(SELECT value.state FROM "RecordValue" value WHERE value."companyId" = ${companyId} AND value."typeId" = ${query.typeId} AND value."recordId" = ${record}.id AND value."fieldId" = ${field.id})`;
      conditions.push(
        filter.operator === "empty"
          ? Prisma.sql`COALESCE(${valueState}, 'missing') = 'missing'`
          : Prisma.sql`${valueState} = 'value'`,
      );
      continue;
    }
    if (isTemporalRecordType(field.valueType)) {
      const endpoint = (column: "rangeStart" | "rangeEnd") =>
        Prisma.sql`(SELECT value.${Prisma.raw(`"${column}"`)} FROM "RecordValue" value WHERE value."companyId" = ${companyId} AND value."typeId" = ${query.typeId} AND value."recordId" = ${record}.id AND value."fieldId" = ${field.id} AND value.state = 'value')`;
      const range = field.valueType === "dateRange" || field.valueType === "dateTimeRange";
      conditions.push(
        temporalFilter(filter, range ? endpoint("rangeStart") : expression, range ? endpoint("rangeEnd") : expression),
      );
      continue;
    }
    if (filter.operator === "between" || filter.operator === "inLastDays")
      throw new Error("Temporal operator requires a date field");
    if (filter.operator === "in" || filter.operator === "notIn") {
      const choices = (filter.values ?? []).map((value) => {
        const currency =
          value.kind === "decimal" && value.currency
            ? Prisma.sql`AND EXISTS (SELECT 1 FROM "RecordValue" amount WHERE amount."companyId" = ${companyId} AND amount."typeId" = ${query.typeId} AND amount."recordId" = ${record}.id AND amount."fieldId" = ${field.id} AND amount.currency = ${value.currency})`
            : Prisma.empty;
        return Prisma.sql`(${expression} = ${scalarParameter(value)} ${currency})`;
      });
      const matches = choices.length ? Prisma.sql`(${Prisma.join(choices, " OR ")})` : Prisma.sql`FALSE`;
      conditions.push(filter.operator === "in" ? matches : Prisma.sql`NOT COALESCE(${matches}, FALSE)`);
      continue;
    }
    if (!filter.value) throw new Error("Query comparison requires a value");
    if (field.multiple) {
      if (filter.value.kind !== "text") throw new Error("Collection query requires a text element");
      const operand = filter.value.value;
      const exact = Prisma.sql`EXISTS (SELECT 1 FROM "RecordValue" value WHERE value."companyId" = ${companyId} AND value."typeId" = ${query.typeId} AND value."recordId" = ${record}.id AND value."fieldId" = ${field.id} AND value."textListValue" @> ARRAY[${operand}]::text[])`;
      if (filter.operator === "eq" || filter.operator === "ne") {
        conditions.push(filter.operator === "ne" ? Prisma.sql`NOT (${exact})` : exact);
        continue;
      }
      if (filter.operator === "contains" || filter.operator === "startsWith") {
        const pattern = `${filter.operator === "contains" ? "%" : ""}${operand.replace(/[\\%_]/g, "\\$&")}%`;
        conditions.push(
          Prisma.sql`EXISTS (SELECT 1 FROM "RecordValue" value CROSS JOIN LATERAL unnest(value."textListValue") element(text) WHERE value."companyId" = ${companyId} AND value."typeId" = ${query.typeId} AND value."recordId" = ${record}.id AND value."fieldId" = ${field.id} AND value.state = 'value' AND element.text ILIKE ${pattern})`,
        );
        continue;
      }
    }
    if (filter.operator === "contains" || filter.operator === "startsWith") {
      if (filter.value.kind !== "text") throw new Error("Text query must be validated before compilation");
      const pattern = `${filter.operator === "contains" ? "%" : ""}${filter.value.value.replace(/[\\%_]/g, "\\$&")}%`;
      conditions.push(Prisma.sql`${expression} ILIKE ${pattern}`);
      continue;
    }
    const operators = {
      eq: "=",
      ne: "<>",
      gt: ">",
      gte: ">=",
      lt: "<",
      lte: "<=",
    } as const;
    conditions.push(
      Prisma.sql`${expression} ${Prisma.raw(operators[filter.operator])} ${scalarParameter(filter.value)}`,
    );
    if (filter.value.kind === "decimal" && filter.value.currency) {
      conditions.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "RecordValue" value WHERE value."companyId" = ${companyId} AND value."typeId" = ${query.typeId} AND value."recordId" = ${record}."id" AND value."fieldId" = ${field.id} AND value."currency" = ${filter.value.currency})`,
      );
    }
  }
  for (const [index, filter] of query.relationships.entries()) {
    const relation = model.relationships.find((relation) => relation.id === filter.relationId && !relation.archived);
    if (!relation) throw new Error("Relationship query must be validated before compilation");
    const outgoing = filter.direction === "outgoing";
    const typeId = outgoing ? relation.targetTypeId : relation.sourceTypeId;
    const target = Prisma.raw(`"filter_target_${index}"`);
    const link = Prisma.raw(`"filter_link_${index}"`);
    const sourceId = outgoing ? Prisma.sql`${link}."sourceId"` : Prisma.sql`${link}."targetId"`;
    const targetId = outgoing ? Prisma.sql`${link}."targetId"` : Prisma.sql`${link}."sourceId"`;
    const scope = access.get(typeId) ?? { userId: "", access: "none" as const };
    const selected =
      filter.recordIds === null
        ? Prisma.sql`TRUE`
        : filter.recordIds.length
          ? Prisma.sql`${target}.id IN (${Prisma.join(filter.recordIds)})`
          : Prisma.sql`FALSE`;
    const matching = Prisma.sql`EXISTS (SELECT 1 FROM "RecordLink" ${link} JOIN "CrmRecord" ${target} ON ${target}."companyId" = ${companyId} AND ${target}."typeId" = ${typeId} AND ${target}.id = ${targetId} WHERE ${link}."companyId" = ${companyId} AND ${link}."relationId" = ${relation.id} AND ${sourceId} = ${record}.id AND ${recordReadPredicate(companyId, scope, target)} AND ${selected})`;
    conditions.push(filter.operator === "none" ? Prisma.sql`NOT (${matching})` : matching);
  }
  for (const [index, filter] of (query.relatedFilters ?? []).entries()) {
    const steps = filter.path.map((step) => {
      const relation = model.relationships.find((relation) => relation.id === step.relationId && !relation.archived);
      if (!relation) throw new Error("Related filters must be validated before compilation");
      return {
        ...step,
        relation,
        typeId: step.direction === "outgoing" ? relation.targetTypeId : relation.sourceTypeId,
      };
    });
    const last = steps.at(-1);
    if (!last) throw new Error("Related filters require a relationship path");
    const matching = compileRecordQuery(
      companyId,
      RecordQuerySchema.parse({
        typeId: last.typeId,
        filters: filter.filters,
        relationships: filter.relationships,
        search: filter.search,
      }),
      model,
      access,
    ).matching;
    const pathPredicate = (level: number, parent: Prisma.Sql): Prisma.Sql => {
      const step = steps[level];
      const target = Prisma.raw(`"related_${index}_${level}"`);
      const link = Prisma.raw(`"related_link_${index}_${level}"`);
      const sourceId = step.direction === "outgoing" ? Prisma.sql`${link}."sourceId"` : Prisma.sql`${link}."targetId"`;
      const targetId = step.direction === "outgoing" ? Prisma.sql`${link}."targetId"` : Prisma.sql`${link}."sourceId"`;
      const scope = access.get(step.typeId) ?? { userId: "", access: "none" as const };
      const predicate =
        level === steps.length - 1
          ? Prisma.sql`${target}.id IN (${matching}) AND ${filter.recordIds === undefined ? Prisma.sql`TRUE` : filter.recordIds.length ? Prisma.sql`${target}.id IN (${Prisma.join(filter.recordIds)})` : Prisma.sql`FALSE`}`
          : pathPredicate(level + 1, target);
      return Prisma.sql`EXISTS (SELECT 1 FROM "RecordLink" ${link}
        JOIN "CrmRecord" ${target} ON ${target}."companyId" = ${companyId} AND ${target}."typeId" = ${step.typeId} AND ${target}.id = ${targetId}
        WHERE ${link}."companyId" = ${companyId} AND ${link}."relationId" = ${step.relation.id}
          AND ${link}."sourceTypeId" = ${step.relation.sourceTypeId} AND ${link}."targetTypeId" = ${step.relation.targetTypeId} AND ${sourceId} = ${parent}.id
          AND ${recordReadPredicate(companyId, scope, target)} AND ${predicate})`;
    };
    const related = pathPredicate(0, record);
    conditions.push(filter.operator === "none" ? Prisma.sql`NOT (${related})` : related);
  }
  const ordering = query.sort.map((sort) => {
    if (sort.fieldId === "system:createdAt" || sort.fieldId === "system:updatedAt") {
      const column =
        sort.fieldId === "system:createdAt" ? Prisma.sql`${record}."createdAt"` : Prisma.sql`${record}."updatedAt"`;
      return Prisma.sql`${column} ${Prisma.raw(sort.direction === "asc" ? "ASC" : "DESC")}`;
    }
    const field = fields.get(sort.fieldId);
    if (!field) throw new Error("Sort field must be validated before compilation");
    const collation = ["text", "email", "phone", "url", "select", "member"].includes(field.valueType)
      ? Prisma.sql`COLLATE ${recordCollation(query.locale)}`
      : Prisma.empty;
    const expression =
      field.valueType === "select"
        ? Prisma.sql`array_position(ARRAY[${field.options.length ? Prisma.join(field.options.map((option) => option.id)) : Prisma.empty}]::text[], ${scalar(field)})`
        : scalar(field);
    return Prisma.sql`CASE WHEN ${fieldReadPredicate(companyId, field, model, access, record)} THEN ${expression} ELSE NULL END ${field.valueType === "select" ? Prisma.empty : collation} ${Prisma.raw(sort.direction === "asc" ? "ASC" : "DESC")} NULLS LAST`;
  });
  ordering.push(Prisma.sql`${record}."createdAt" DESC`, Prisma.sql`${record}."id" ASC`);
  const source = Prisma.sql`FROM "CrmRecord" ${record} WHERE ${Prisma.join(conditions, " AND ")}`;
  return {
    matching: Prisma.sql`SELECT ${record}."id" ${source}`,
    ordered: Prisma.sql`SELECT ${record}.*, ROW_NUMBER() OVER (ORDER BY ${Prisma.join(ordering, ", ")}) AS ordinal ${source}`,
    ids: Prisma.sql`SELECT ${record}."id" ${source} ORDER BY ${Prisma.join(ordering, ", ")} LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`,
    count: Prisma.sql`SELECT COUNT(*)::integer AS count ${source}`,
  };
}
