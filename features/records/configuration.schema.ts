import { z } from "zod";
import { RecordColumnKeySchema, RecordFieldKeySchema } from "./record-column.schema";
import { RecordRelationshipPathSchema, RecordPathStepSchema } from "./record-relationship-path.schema";

import {
  RecordFieldSchema,
  RecordScalarSchema,
  RecordTypeSchema,
  RecordRelationshipSchema,
  RecordAccessPresetSchema,
  RecordCapabilitySchema,
  RecordGrantSchema,
  ExpressionBudgetSchema,
  RecordGroupSummaryDefinitionSchema,
} from "./record-model.schema";

export const CONFIGURATION_TARGET_KINDS = ["type", "field", "relationship"] as const;
export const ConfigurationTargetSchema = z.object({ kind: z.enum(CONFIGURATION_TARGET_KINDS), id: z.uuid() }).strict();
export type ConfigurationTarget = z.infer<typeof ConfigurationTargetSchema>;
export const DeletionReferenceSchema = z
  .object({
    kind: z.enum([
      ...CONFIGURATION_TARGET_KINDS,
      "routine",
      "webhook",
      "widget",
      "view",
      "personalLayout",
      "detailLayout",
    ]),
    id: z.string(),
    typeId: z.uuid().optional(),
    label: z.string(),
  })
  .strict();
export type DeletionReference = z.infer<typeof DeletionReferenceSchema>;
export const DeletionBlockerSchema = z
  .object({
    reason: z.enum([
      "calculation",
      "snapshotTrigger",
      "parentAccess",
      "binding",
      "protected",
      "routine",
      "webhook",
      "widget",
      "requiresRestore",
    ]),
    source: DeletionReferenceSchema,
    target: DeletionReferenceSchema,
  })
  .strict();
export type DeletionBlocker = z.infer<typeof DeletionBlockerSchema>;
export const DeletionCleanupSchema = z
  .object({
    consumer: DeletionReferenceSchema,
    target: DeletionReferenceSchema,
    replacement: DeletionReferenceSchema.nullable()
      .optional()
      .describe("For a deleted name field: the field that now names the records, or null when none is left."),
    effect: z
      .enum(["countsRecords", "triggerChanged", "subscriptionRemoved", "avatar", "calendar"])
      .optional()
      .describe(
        "How the consumer changed: a widget now counts records, a webhook trigger lost the field or was removed, or the field left the avatar or calendar setting.",
      ),
  })
  .strict();
export type DeletionCleanup = z.infer<typeof DeletionCleanupSchema>;
const LiveDefinitionSchema = z
  .boolean()
  .optional()
  .refine((archived): boolean => archived !== true, "Use the delete operation to move an item to Trash.")
  .describe("Always false. Use the delete operation to move an item to Trash.");
export const ConfigurationReferenceSchema = z.union([z.uuid(), z.string().regex(/^\$[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/)]);
const ConfigurationColumnKeySchema = z.union([
  RecordColumnKeySchema,
  ConfigurationReferenceSchema,
  z.string().regex(/^relationship:\$[a-zA-Z][a-zA-Z0-9_.-]{0,63}:(outgoing|incoming)$/),
  z.string().regex(/^path:\$[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/),
]);
type ConfigurationExpression =
  | { kind: "literal"; value: z.infer<typeof RecordScalarSchema> | null }
  | { kind: "field"; fieldId: string }
  | { kind: "optionAttribute"; fieldId: string; attribute: string }
  | {
      kind: "related";
      relationId: string;
      direction: "outgoing" | "incoming";
      expression: ConfigurationExpression;
      reducer: "one" | "sum" | "count" | "average" | "min" | "max";
    }
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
      arguments: ConfigurationExpression[];
    };
const ExpressionSchema: z.ZodType<ConfigurationExpression> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("literal"),
        value: RecordScalarSchema.nullable(),
      })
      .strict(),
    z
      .object({
        kind: z.literal("field"),
        fieldId: ConfigurationReferenceSchema,
      })
      .strict(),
    z
      .object({
        kind: z.literal("optionAttribute"),
        fieldId: ConfigurationReferenceSchema,
        attribute: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/),
      })
      .strict(),
    z
      .object({
        kind: z.literal("related"),
        relationId: ConfigurationReferenceSchema,
        direction: z.enum(["outgoing", "incoming"]),
        expression: ExpressionSchema,
        reducer: z.enum(["one", "sum", "count", "average", "min", "max"]),
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
        arguments: z.array(ExpressionSchema).min(1).max(32),
      })
      .strict(),
  ]),
);
const BoundedExpressionSchema = ExpressionBudgetSchema.pipe(ExpressionSchema);
export function configurationSchemaWithExpression<T extends z.ZodType>(expressionSchema: T, trashOperations = false) {
  const ValidatedBehaviorSchema = z.discriminatedUnion("kind", [
    z
      .object({
        kind: z.literal("input"),
        defaultValue: RecordScalarSchema.nullable().optional(),
      })
      .strict(),
    z.object({ kind: z.literal("formula"), expression: expressionSchema }).strict(),
    z.object({ kind: z.literal("lookup"), expression: expressionSchema }).strict(),
    z.object({ kind: z.literal("rollup"), expression: expressionSchema }).strict(),
    z
      .object({
        kind: z.literal("snapshot"),
        expression: expressionSchema,
        capture: z.enum(["create", "explicit", "whenChanged"]),
        allowManualOverride: z.boolean().optional(),
        triggerFieldId: ConfigurationReferenceSchema.optional(),
        triggerValue: RecordScalarSchema.optional(),
      })
      .strict(),
  ]);
  const BehaviorSchema = z
    .object({
      kind: z.enum(["input", "formula", "lookup", "rollup", "snapshot"]),
      defaultValue: RecordScalarSchema.nullable().optional(),
      expression: expressionSchema.optional(),
      capture: z.enum(["create", "explicit", "whenChanged"]).optional(),
      allowManualOverride: z.boolean().optional(),
      triggerFieldId: ConfigurationReferenceSchema.optional(),
      triggerValue: RecordScalarSchema.optional(),
    })
    .strict()
    .describe(
      "Input allows only kind and optional defaultValue. Formula, lookup and rollup require expression. Snapshot requires expression and capture; only snapshots allow override and trigger settings. Omit fields that do not apply.",
    )
    .transform((value, context) => {
      const parsed = ValidatedBehaviorSchema.safeParse(value);
      if (!parsed.success) {
        context.issues.push(...parsed.error.issues.map((issue) => ({ ...issue, input: undefined })));
        return z.NEVER;
      }
      return parsed.data;
    });
  return z
    .object({
      expectedRevision: z.number().int().nonnegative(),
      idempotencyKey: z.string().min(8).max(200),
      operations: z
        .array(
          z.discriminatedUnion("operation", [
            z
              .object({
                operation: z.literal("createType"),
                reference: ConfigurationReferenceSchema,
                label: z.string().trim().min(1).max(200),
                pluralLabel: z.string().trim().min(1).max(200),
                description: z.string().max(4000),
                icon: z.string().max(64),
                embedded: z.boolean(),
                navigationVisible: z.boolean().optional(),
                accessPresetId: ConfigurationReferenceSchema.nullable(),
              })
              .strict(),
            z
              .object({
                operation: z.literal("putType"),
                type: RecordTypeSchema.extend({
                  archived: LiveDefinitionSchema,
                  id: ConfigurationReferenceSchema,
                  primaryFieldId: ConfigurationReferenceSchema.nullable(),
                  parentRelationshipId: ConfigurationReferenceSchema.nullable().default(null),
                  relationshipPaths: z
                    .array(
                      RecordRelationshipPathSchema.extend({
                        archived: LiveDefinitionSchema,
                        id: ConfigurationReferenceSchema,
                        path: z
                          .array(RecordPathStepSchema.extend({ relationId: ConfigurationReferenceSchema }))
                          .min(1)
                          .max(6),
                      }),
                    )
                    .max(32)
                    .optional(),
                  defaults: RecordTypeSchema.shape.defaults.extend({
                    columns: z.array(ConfigurationColumnKeySchema),
                    hiddenColumns: z.array(ConfigurationColumnKeySchema),
                    groupBy: ConfigurationColumnKeySchema.nullable(),
                    groupSummaries: z
                      .array(RecordGroupSummaryDefinitionSchema.extend({ fieldId: ConfigurationReferenceSchema }))
                      .max(8)
                      .optional(),
                    sortField: z.union([ConfigurationReferenceSchema, RecordFieldKeySchema]).nullable(),
                    pinnedFields: z.array(ConfigurationColumnKeySchema),
                  }),
                }),
              })
              .strict(),
            z
              .object({
                operation: z.literal("putField"),
                field: RecordFieldSchema.omit({
                  publishedSummary: true,
                }).extend({
                  archived: LiveDefinitionSchema,
                  id: ConfigurationReferenceSchema,
                  typeId: ConfigurationReferenceSchema,
                  behavior: BehaviorSchema,
                }),
              })
              .strict(),
            z
              .object({
                operation: z.literal("putRelationship"),
                relationship: RecordRelationshipSchema.extend({
                  archived: LiveDefinitionSchema,
                  id: ConfigurationReferenceSchema,
                  sourceTypeId: ConfigurationReferenceSchema,
                  targetTypeId: ConfigurationReferenceSchema,
                  messagesOnSource: RecordRelationshipSchema.shape.messagesOnSource.default(false),
                  messagesOnTarget: RecordRelationshipSchema.shape.messagesOnTarget.default(false),
                }),
              })
              .strict(),
            z
              .object({
                operation: z.literal("putAccessPreset"),
                preset: RecordAccessPresetSchema.extend({
                  id: ConfigurationReferenceSchema,
                }),
              })
              .strict(),
            z
              .object({
                operation: z.literal("putCapability"),
                capability: RecordCapabilitySchema.extend({
                  id: ConfigurationReferenceSchema,
                  typeId: ConfigurationReferenceSchema,
                  fields: z.array(
                    z
                      .object({
                        role: RecordCapabilitySchema.shape.fields.element.shape.role,
                        fieldId: ConfigurationReferenceSchema,
                      })
                      .strict(),
                  ),
                }),
              })
              .strict(),
            z
              .object({
                operation: z.literal("publishSummary"),
                fieldId: ConfigurationReferenceSchema,
                published: z.boolean(),
                dependencyHash: z.string().length(64),
              })
              .strict(),
            z
              .object({ operation: z.literal("delete"), target: ConfigurationTargetSchema })
              .strict()
              .describe(
                "Move a list, field (including a Channels field) or relationship to Trash, where it can be restored for 30 days. Harmless references in views, layouts and widgets are removed; calculations, parent access, bindings, routines and webhooks that use it block the deletion.",
              ),
            ...(trashOperations
              ? ([
                  z.object({ operation: z.literal("restore"), target: ConfigurationTargetSchema }).strict(),
                  z.object({ operation: z.literal("deletePermanently"), target: ConfigurationTargetSchema }).strict(),
                ] as const)
              : ([] as const)),
            z
              .object({
                operation: z.literal("setTypeGrants"),
                typeId: ConfigurationReferenceSchema,
                grants: z.array(RecordGrantSchema),
              })
              .strict(),
          ]),
        )
        .min(1)
        .max(200),
    })
    .strict();
}
export const ConfigurationChangeSchema = configurationSchemaWithExpression(BoundedExpressionSchema, true);
export const PublicConfigurationChangeSchema = configurationSchemaWithExpression(BoundedExpressionSchema);
export const ConfigurationContractSchema = configurationSchemaWithExpression(ExpressionSchema);
export type ConfigurationChange = z.infer<typeof ConfigurationChangeSchema>;
export const ConfigurationPreviewSchema = z
  .object({
    expectedRevision: z.number().int(),
    nextRevision: z.number().int(),
    valid: z.boolean(),
    execution: z.enum(["synchronous", "background"]),
    dataValidation: z.enum(["complete", "staged"]),
    affectedRecords: z
      .number()
      .int()
      .nullable()
      .describe("Exact only when the caller reads every affected list fully; otherwise null."),
    hiddenRecords: z
      .boolean()
      .describe("True when the change touches records the caller cannot see; counts are then withheld."),
    references: z.array(z.object({ reference: z.string(), id: z.uuid() }).strict()),
    issues: z.array(
      z
        .object({
          code: z.string(),
          fieldId: z.string().optional(),
          typeId: z.string().optional(),
          relationId: z.string().optional(),
        })
        .strict(),
    ),
    calculations: z.array(z.object({ fieldId: z.uuid(), dependencyHash: z.string() }).strict()),
    deletion: z
      .object({
        blockers: z.array(DeletionBlockerSchema),
        cleaned: z.array(DeletionCleanupSchema),
        removed: z
          .object({
            records: z.number().int().nullable(),
            values: z.number().int().nullable(),
            links: z.number().int().nullable(),
            relationships: z.number().int(),
            views: z.number().int(),
            grants: z.number().int(),
            identifiers: z.number().int().nullable(),
            identifierRecords: z.number().int().nullable(),
          })
          .strict()
          .nullable(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type ConfigurationPreview = z.infer<typeof ConfigurationPreviewSchema>;
