import { recordInvariant } from "./record-invariant";

import { z } from "zod";
import { CHIP_COLORS } from "@/constants/chip-colors";
import { RecordIdentitySchema } from "./record-identity.schema";
import { RecordColumnKeySchema, RecordFieldKeySchema } from "./record-column.schema";
import { RecordRelationshipPathSchema } from "./record-relationship-path.schema";

export const RecordRefSchema = z.object({ typeId: z.uuid(), recordId: z.uuid() }).strict();
export type RecordRef = z.infer<typeof RecordRefSchema>;

export const RecordValueTypeSchema = z.enum([
  "text",
  "richText",
  "number",
  "currency",
  "boolean",
  "date",
  "dateTime",
  "dateRange",
  "dateTimeRange",
  "select",
  "email",
  "phone",
  "url",
  "member",
]);
export type RecordValueType = z.infer<typeof RecordValueTypeSchema>;

export const DecimalStringSchema = z
  .string()
  .regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/)
  .max(128);
export const RecordDateTimeSchema = z.iso
  .datetime({ offset: true })
  .refine((value) => !/\.\d{7}/.test(value), "Timestamp precision cannot exceed six decimal places");
const ValidatedRecordScalarSchema = z.union([
  z.object({ kind: z.literal("text"), value: z.string().max(100000) }).strict(),
  z
    .object({
      kind: z.literal("textList"),
      value: z.array(z.string().max(100000)).min(1).max(100),
    })
    .strict(),
  z
    .object({
      kind: z.literal("decimal"),
      value: DecimalStringSchema,
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .nullable(),
    })
    .strict(),
  z.object({ kind: z.literal("boolean"), value: z.boolean() }).strict(),
  z
    .object({
      kind: z.literal("date"),
      value: z.union([z.iso.date(), RecordDateTimeSchema]),
    })
    .strict(),
  z.object({ kind: z.literal("dateTime"), value: RecordDateTimeSchema }).strict(),
  z
    .object({
      kind: z.literal("range"),
      start: z.string().nullable(),
      end: z.string().nullable(),
    })
    .strict(),
  z.object({ kind: z.literal("select"), value: z.string().min(1).max(200) }).strict(),
  z
    .object({
      kind: z.literal("selectList"),
      value: z
        .array(z.string().min(1).max(200))
        .min(1)
        .max(100)
        .refine((ids) => new Set(ids).size === ids.length, "Each option can be selected once"),
    })
    .strict(),
  z.object({ kind: z.literal("member"), value: z.uuid() }).strict(),
  z
    .object({
      kind: z.literal("richText"),
      documentJson: z.string().max(1000000),
    })
    .strict(),
]);
export const RecordScalarSchema = z
  .object({
    kind: z.enum([
      "text",
      "textList",
      "decimal",
      "boolean",
      "date",
      "dateTime",
      "range",
      "select",
      "selectList",
      "member",
      "richText",
    ]),
    value: z.union([z.string().max(100000), z.boolean(), z.array(z.string().max(100000)).min(1).max(100)]).optional(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable()
      .optional(),
    start: z.string().nullable().optional(),
    end: z.string().nullable().optional(),
    documentJson: z.string().max(1000000).optional(),
  })
  .strict()
  .describe("Typed CRM value; only the fields for the selected kind are allowed.")
  .pipe(ValidatedRecordScalarSchema);
export type RecordScalar = z.infer<typeof RecordScalarSchema>;

export const CalculatedValueSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("value"), value: RecordScalarSchema }).strict(),
  z.object({ state: z.literal("missing") }).strict(),
  z.object({ state: z.literal("restricted") }).strict(),
  z
    .object({
      state: z.literal("error"),
      code: z.enum([
        "division_by_zero",
        "type_mismatch",
        "currency_mismatch",
        "invalid_date",
        "out_of_range",
        "dependency_error",
      ]),
    })
    .strict(),
]);
export type CalculatedValue = z.infer<typeof CalculatedValueSchema>;

export type CalculationExpression =
  | { kind: "literal"; value: RecordScalar | null }
  | { kind: "field"; fieldId: string }
  | {
      kind: "related";
      relationId: string;
      direction: "outgoing" | "incoming";
      expression: CalculationExpression;
      reducer: "one" | "sum" | "count" | "average" | "min" | "max";
    }
  | { kind: "optionAttribute"; fieldId: string; attribute: string }
  | {
      kind: "operation";
      operator:
        | "add"
        | "subtract"
        | "multiply"
        | "divide"
        | "equal"
        | "lessThan"
        | "greaterThan"
        | "and"
        | "or"
        | "not"
        | "if"
        | "coalesce"
        | "concat"
        | "lower"
        | "upper"
        | "trim"
        | "daysBetween";
      arguments: CalculationExpression[];
    };

const ExpressionShape: z.ZodType<CalculationExpression> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("literal"),
        value: RecordScalarSchema.nullable(),
      })
      .strict(),
    z.object({ kind: z.literal("field"), fieldId: z.uuid() }).strict(),
    z
      .object({
        kind: z.literal("related"),
        relationId: z.uuid(),
        direction: z.enum(["outgoing", "incoming"]),
        expression: ExpressionShape,
        reducer: z.enum(["one", "sum", "count", "average", "min", "max"]),
      })
      .strict(),
    z
      .object({
        kind: z.literal("optionAttribute"),
        fieldId: z.uuid(),
        attribute: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/),
      })
      .strict(),
    z
      .object({
        kind: z.literal("operation"),
        operator: z.enum([
          "add",
          "subtract",
          "multiply",
          "divide",
          "equal",
          "lessThan",
          "greaterThan",
          "and",
          "or",
          "not",
          "if",
          "coalesce",
          "concat",
          "lower",
          "upper",
          "trim",
          "daysBetween",
        ]),
        arguments: z.array(ExpressionShape).min(1).max(32),
      })
      .strict(),
  ]),
);

export const ExpressionBudgetSchema = z.unknown().superRefine((input, ctx) => {
  const pending: Array<{ value: unknown; depth: number }> = [{ value: input, depth: 0 }];
  let nodes = 0;
  while (pending.length) {
    const current = recordInvariant(pending.pop());
    if (++nodes > 256 || current.depth > 24) {
      ctx.addIssue({
        code: "custom",
        message: "Calculation exceeds the expression budget",
      });
      return;
    }
    if (!current.value || typeof current.value !== "object") continue;
    const value = current.value as Record<string, unknown>;
    if (value.expression) pending.push({ value: value.expression, depth: current.depth + 1 });
    if (Array.isArray(value.arguments))
      for (const child of value.arguments) pending.push({ value: child, depth: current.depth + 1 });
  }
});
export const CalculationExpressionSchema = ExpressionBudgetSchema.pipe(ExpressionShape);

export const FieldBehaviorSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("input"),
      defaultValue: RecordScalarSchema.nullable().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("formula"),
      expression: CalculationExpressionSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("lookup"),
      expression: CalculationExpressionSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("rollup"),
      expression: CalculationExpressionSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("snapshot"),
      expression: CalculationExpressionSchema,
      capture: z.enum(["create", "explicit", "whenChanged"]),
      allowManualOverride: z.boolean().optional(),
      triggerFieldId: z.uuid().optional(),
      triggerValue: RecordScalarSchema.optional(),
    })
    .strict(),
]);

export const RecordFieldSchema = z
  .object({
    id: z.uuid(),
    typeId: z.uuid(),
    label: z.string().trim().min(1).max(200),
    valueType: RecordValueTypeSchema,
    behavior: FieldBehaviorSchema,
    required: z.boolean(),
    multiple: z
      .boolean()
      .optional()
      .describe(
        "Allows several values: text, email, phone and url store a textList; a select field becomes a multiple choice storing selectList option ids and must use input behavior.",
      ),
    format: z
      .object({
        color: z.string().max(64).nullable().optional(),
        dateFormat: z.string().max(64).nullable().optional(),
        currency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .nullable()
          .optional(),
        decimalPlaces: z.number().int().min(0).max(30).nullable().optional(),
        onClick: z
          .enum(["open", "copy"])
          .nullable()
          .optional()
          .describe(
            "Email, phone and url fields only: what clicking a value does. open (default) starts mail, a call or opens the link; copy copies it.",
          ),
      })
      .strict()
      .optional(),
    archived: z.boolean().describe("True while the item is in Trash."),
    publishedSummary: z.boolean(),
    options: z.array(
      z
        .object({
          id: z.string().min(1).max(200),
          label: z.string().min(1).max(200),
          color: z.string().max(64).nullable(),
          attributes: z.array(z.object({ key: z.string().max(64), value: RecordScalarSchema }).strict()),
        })
        .strict(),
    ),
    position: z.number().int().nonnegative(),
  })
  .strict();
export type RecordField = z.infer<typeof RecordFieldSchema>;

export const RecordRelationshipSchema = z
  .object({
    id: z.uuid(),
    sourceTypeId: z.uuid(),
    targetTypeId: z.uuid(),
    sourceLabel: z.string().trim().min(1).max(200),
    targetLabel: z.string().trim().min(1).max(200),
    sourceCardinality: z.enum(["one", "many"]),
    targetCardinality: z.enum(["one", "many"]),
    onSourceDelete: z.enum(["unlink", "restrict", "cascade"]),
    onTargetDelete: z.enum(["unlink", "restrict", "cascade"]),
    messagesOnSource: z
      .boolean()
      .describe("Show the messages of directly linked target records on each source record's activity timeline."),
    messagesOnTarget: z
      .boolean()
      .describe("Show the messages of directly linked source records on each target record's activity timeline."),
    archived: z.boolean().describe("True while the item is in Trash."),
  })
  .strict();
export type RecordRelationship = z.infer<typeof RecordRelationshipSchema>;

export const RecordGroupSummaryDefinitionSchema = z
  .object({
    fieldId: z.uuid(),
    aggregation: z.enum(["sum", "average", "min", "max"]),
  })
  .strict();
export type RecordGroupSummaryDefinition = z.infer<typeof RecordGroupSummaryDefinitionSchema>;

export const RecordTypeSchema = z
  .object({
    id: z.uuid(),
    label: z.string().trim().min(1).max(200),
    pluralLabel: z.string().trim().min(1).max(200),
    description: z.string().max(4000),
    icon: z.string().max(64),
    color: z.enum(CHIP_COLORS).optional().describe("Chip color for links to records of this list; neutral when unset."),
    primaryFieldId: z.uuid(),
    parentRelationshipId: z.uuid().nullable().default(null),
    embedded: z.boolean(),
    navigationVisible: z.boolean().default(true),
    archived: z.boolean().describe("True while the item is in Trash."),
    position: z.number().int().nonnegative(),
    defaults: z
      .object({
        columns: z.array(RecordColumnKeySchema),
        hiddenColumns: z.array(RecordColumnKeySchema),
        layout: z.enum(["table", "board"]),
        groupBy: RecordColumnKeySchema.nullable(),
        groupBucket: z.enum(["day", "week", "month"]).optional(),
        groupSummaries: z.array(RecordGroupSummaryDefinitionSchema).max(8).optional(),
        sortField: RecordFieldKeySchema.nullable(),
        sortDirection: z.enum(["asc", "desc"]),
        pinnedFields: z.array(RecordColumnKeySchema),
      })
      .strict(),
    relationshipPaths: z.array(RecordRelationshipPathSchema).max(32).optional(),
  })
  .strict();
export type RecordType = z.infer<typeof RecordTypeSchema>;

export const RecordGrantSchema = z
  .object({
    roleId: z.uuid(),
    actions: z.array(z.enum(["create", "readOwn", "readAll", "update", "delete"])),
  })
  .strict();
export const RecordAccessPresetSchema = z
  .object({
    id: z.uuid(),
    label: z.string().trim().min(1).max(200),
    grants: z.array(RecordGrantSchema),
    archived: z.boolean(),
  })
  .strict();
export const RecordCapabilitySchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(["channels", "membershipAuthorization", "avatar", "calendar"]),
    enabled: z.boolean().optional(),
    providerAvatar: z.boolean().optional(),
    typeId: z.uuid(),
    fields: z.array(
      z
        .object({
          role: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,63}$/),
          fieldId: z.uuid(),
        })
        .strict(),
    ),
  })
  .strict();
export const RecordModelSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    types: z.array(RecordTypeSchema),
    fields: z.array(RecordFieldSchema),
    relationships: z.array(RecordRelationshipSchema),
    accessPresets: z.array(RecordAccessPresetSchema).default([]),
    capabilities: z.array(RecordCapabilitySchema).default([]),
  })
  .strict();
export type RecordModel = z.infer<typeof RecordModelSchema>;

const withoutFormula = { expression: CalculationExpressionSchema.optional() };
export const FieldBehaviorViewSchema = z.discriminatedUnion("kind", [
  FieldBehaviorSchema.options[0],
  FieldBehaviorSchema.options[1].extend(withoutFormula),
  FieldBehaviorSchema.options[2].extend(withoutFormula),
  FieldBehaviorSchema.options[3].extend(withoutFormula),
  FieldBehaviorSchema.options[4].extend(withoutFormula),
]);
export const RecordFieldViewSchema = RecordFieldSchema.extend({
  behavior: FieldBehaviorViewSchema.describe(
    "Calculated fields omit expression, triggerFieldId and triggerValue when the caller cannot read every input.",
  ),
});
export type RecordFieldView = z.infer<typeof RecordFieldViewSchema>;
export const RecordModelViewSchema = RecordModelSchema.extend({ fields: z.array(RecordFieldViewSchema) });
export type RecordModelView = z.infer<typeof RecordModelViewSchema>;

export const RecordFieldAssignmentSchema = z
  .object({ fieldId: z.uuid(), value: RecordScalarSchema.nullable() })
  .strict();
export const RecordFieldAppendSchema = z
  .object({
    fieldId: z.uuid(),
    append: z
      .string()
      .max(65_535)
      .refine((text) => text.trim().length > 0, "Append text must not be empty")
      .describe(
        "Markdown for a Formatted text field or plain text for a Text field, added after the current value with a blank line in between.",
      ),
  })
  .strict();
export const RecordFieldUpdateSchema = z.union([RecordFieldAssignmentSchema, RecordFieldAppendSchema]);
export type RecordFieldUpdate = z.infer<typeof RecordFieldUpdateSchema>;
export const RecordRelationshipSummarySchema = z
  .object({
    relationId: z.uuid(),
    direction: z.enum(["outgoing", "incoming"]),
    records: z.array(z.object({ ref: RecordRefSchema, title: CalculatedValueSchema }).strict()),
    readableCount: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  })
  .strict();
export type RecordRelationshipSummary = z.infer<typeof RecordRelationshipSummarySchema>;
export const RecordPathSummarySchema = RecordRelationshipSummarySchema.omit({
  relationId: true,
  direction: true,
})
  .extend({ pathId: z.uuid() })
  .strict();
export type RecordPathSummary = z.infer<typeof RecordPathSummarySchema>;
export const RecordMemberSchema = z
  .object({
    id: z.uuid(),
    firstName: z.string(),
    lastName: z.string(),
    avatarUrl: z.string().nullable(),
  })
  .strict();
export type RecordMember = z.infer<typeof RecordMemberSchema>;
export const RecordDtoSchema = z
  .object({
    ref: RecordRefSchema,
    version: z.number().int().positive(),
    protectedKind: z.literal("membershipAuthorization").optional(),
    schemaRevision: z.number().int(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    fields: z.array(z.object({ fieldId: z.uuid(), result: CalculatedValueSchema }).strict()),
    assignedUserIds: z.array(z.uuid()),
    assignedUsers: z.array(RecordMemberSchema).default([]),
    memberUsers: z.array(RecordMemberSchema).default([]),
    relationships: z.array(RecordRelationshipSummarySchema).default([]),
    relationshipPaths: z.array(RecordPathSummarySchema).optional(),
    identities: z.array(RecordIdentitySchema).optional(),
  })
  .strict();
export type RecordDto = z.infer<typeof RecordDtoSchema>;
