import { z } from "zod";

import { CHIP_COLORS } from "@/constants/chip-colors";
import { WIDGET_STARTER_DISPLAY_TYPES } from "@/features/widget/widget-display-rules";
import { RECORD_MEASURE_DATE_INTERVALS } from "@/features/records/record-measure.schema";

import { SETUP_LINE_ITEM_LIST, SETUP_LIST_ROLES, SETUP_REQUIRED_LIST_ROLES, setupAnchorFields } from "./setup-anchors";

export const SETUP_PLAN_LIMITS = {
  lists: 10,
  fields: 80,
  relationships: 20,
  calculations: 12,
  options: 20,
  listDefaults: 16,
  columns: 20,
  widgets: 12,
  widgetFilters: 4,
  sampleLists: 16,
  sampleRecords: 10,
  pages: 12,
  pageSections: 12,
  importColumns: 100,
  expressionNodes: 24,
  expressionDepth: 6,
} as const;

export const SetupKeySchema = z.string().regex(/^[a-z][a-zA-Z0-9]{0,23}$/);
export const SetupFieldKeySchema = z.string().regex(/^[a-z][a-zA-Z0-9]{0,23}\.[a-z][a-zA-Z0-9]{0,23}$/);
export const SetupSystemColumnSchema = z.enum(["system:createdAt", "system:updatedAt", "system:assignedTo"]);
const LabelSchema = z.string().trim().min(1).max(80);
const DescriptionSchema = z.string().trim().max(500);
const IconSchema = z.string().regex(/^[a-z][a-zA-Z]{0,39}$/);
const ChipColorSchema = z.enum(CHIP_COLORS);

export const SETUP_FIELD_VALUE_TYPES = [
  "text",
  "richText",
  "number",
  "currency",
  "boolean",
  "date",
  "dateTime",
  "select",
  "email",
  "phone",
  "url",
  "member",
] as const;

export const SetupOptionSchema = z
  .object({
    key: SetupKeySchema,
    label: LabelSchema,
    color: ChipColorSchema.optional(),
    weight: z.number().int().min(0).max(100).optional(),
    outcome: z.enum(["open", "won", "lost"]).optional(),
  })
  .strict();
export type SetupOption = z.infer<typeof SetupOptionSchema>;

const OptionListSchema = z
  .array(SetupOptionSchema)
  .max(SETUP_PLAN_LIMITS.options)
  .refine((options) => new Set(options.map((option) => option.key)).size === options.length, "Option keys repeat")
  .refine(
    (options) => new Set(options.map((option) => option.label.toLowerCase())).size === options.length,
    "Option labels repeat",
  );

export type SetupExpression =
  | { op: "field"; field: string }
  | { op: "number"; value: string }
  | { op: "add" | "subtract" | "multiply" | "divide"; left: SetupExpression; right: SetupExpression }
  | { op: "optionWeight"; field: string }
  | { op: "daysBetween"; from: string; to: string }
  | {
      op: "related";
      relationship: string;
      direction: "outgoing" | "incoming";
      field: string;
      reducer: "one" | "sum" | "count" | "average" | "min" | "max";
    };

export const SetupExpressionSchema: z.ZodType<SetupExpression> = z.lazy(() =>
  z.discriminatedUnion("op", [
    z.object({ op: z.literal("field"), field: SetupFieldKeySchema }).strict(),
    z
      .object({
        op: z.literal("number"),
        value: z.string().regex(/^-?(?:0|[1-9]\d{0,14})(?:\.\d{1,6})?$/),
      })
      .strict(),
    z
      .object({
        op: z.enum(["add", "subtract", "multiply", "divide"]),
        left: SetupExpressionSchema,
        right: SetupExpressionSchema,
      })
      .strict(),
    z.object({ op: z.literal("optionWeight"), field: SetupFieldKeySchema }).strict(),
    z.object({ op: z.literal("daysBetween"), from: SetupFieldKeySchema, to: SetupFieldKeySchema }).strict(),
    z
      .object({
        op: z.literal("related"),
        relationship: SetupKeySchema,
        direction: z.enum(["outgoing", "incoming"]),
        field: SetupFieldKeySchema,
        reducer: z.enum(["one", "sum", "count", "average", "min", "max"]),
      })
      .strict(),
  ]),
);

const BoundedExpressionSchema = z
  .unknown()
  .superRefine((value, context) => {
    let nodes = 0;
    const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 1 }];
    while (pending.length) {
      const current = pending.pop();
      if (!current) break;
      nodes++;
      if (nodes > SETUP_PLAN_LIMITS.expressionNodes || current.depth > SETUP_PLAN_LIMITS.expressionDepth) {
        context.addIssue({ code: "custom", message: "The calculation is too large." });
        return;
      }
      if (current.value && typeof current.value === "object") {
        const node = current.value as Record<string, unknown>;
        for (const key of ["left", "right"])
          if (node[key] && typeof node[key] === "object") pending.push({ value: node[key], depth: current.depth + 1 });
      }
    }
  })
  .pipe(SetupExpressionSchema);

const FieldOrSystemSchema = z.union([SetupFieldKeySchema, SetupSystemColumnSchema]);

export const SetupWidgetFilterSchema = z.discriminatedUnion("operator", [
  z
    .object({
      operator: z.enum(["in", "notIn"]),
      field: SetupFieldKeySchema,
      options: z.array(SetupKeySchema).min(1).max(SETUP_PLAN_LIMITS.options),
    })
    .strict(),
  z
    .object({
      operator: z.enum(["inLastDays", "notInLastDays"]),
      field: FieldOrSystemSchema,
      days: z.number().int().min(1).max(3_650),
    })
    .strict(),
  z.object({ operator: z.enum(["empty", "notEmpty"]), field: FieldOrSystemSchema }).strict(),
]);
export type SetupWidgetFilter = z.infer<typeof SetupWidgetFilterSchema>;

export const SetupWidgetSchema = z
  .object({
    key: SetupKeySchema,
    title: LabelSchema,
    list: SetupKeySchema,
    aggregation: z.enum(["count", "sum", "average", "min", "max"]),
    valueField: SetupFieldKeySchema.nullable(),
    groupBy: z
      .object({
        path: z
          .array(z.object({ relationship: SetupKeySchema, direction: z.enum(["outgoing", "incoming"]) }).strict())
          .max(2),
        field: FieldOrSystemSchema.nullable(),
        dateInterval: z.enum(RECORD_MEASURE_DATE_INTERVALS).optional(),
      })
      .strict()
      .nullable(),
    filters: z.array(SetupWidgetFilterSchema).max(SETUP_PLAN_LIMITS.widgetFilters),
    display: z.enum(WIDGET_STARTER_DISPLAY_TYPES),
    size: z.enum(["small", "medium", "large", "wide"]).optional(),
  })
  .strict()
  .superRefine((widget, context) => {
    if (widget.aggregation === "count" ? widget.valueField !== null : widget.valueField === null)
      context.addIssue({ code: "custom", path: ["valueField"], message: "Only a count has no value field." });
  });
export type SetupWidget = z.infer<typeof SetupWidgetSchema>;

export const SetupListDefaultSchema = z
  .object({
    list: SetupKeySchema,
    name: LabelSchema,
    layout: z.enum(["table", "board"]),
    groupBy: FieldOrSystemSchema.nullable(),
    sort: z
      .object({ field: FieldOrSystemSchema, direction: z.enum(["asc", "desc"]) })
      .strict()
      .nullable(),
    columns: z.array(SetupFieldKeySchema).max(SETUP_PLAN_LIMITS.columns),
    summaries: z
      .array(z.object({ field: SetupFieldKeySchema, aggregation: z.enum(["sum", "average", "min", "max"]) }).strict())
      .max(4),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.layout === "board" && !value.groupBy)
      context.addIssue({ code: "custom", path: ["groupBy"], message: "A board needs a grouping." });
    if (value.summaries.length && !value.groupBy)
      context.addIssue({ code: "custom", path: ["summaries"], message: "Totals need a grouping." });
  });
export type SetupListDefault = z.infer<typeof SetupListDefaultSchema>;

export const SetupNewListSchema = z
  .object({
    key: SetupKeySchema,
    label: LabelSchema,
    pluralLabel: LabelSchema,
    description: DescriptionSchema.default(""),
    icon: IconSchema,
    color: ChipColorSchema.optional(),
    role: z.enum(SETUP_LIST_ROLES).optional(),
  })
  .strict();

export const SetupNewFieldSchema = z
  .object({
    key: SetupFieldKeySchema,
    label: LabelSchema,
    valueType: z.enum(SETUP_FIELD_VALUE_TYPES),
    required: z.boolean().default(false),
    multiple: z.boolean().default(false),
    options: OptionListSchema.default([]),
  })
  .strict()
  .superRefine((field, context) => {
    if ((field.valueType === "select") !== field.options.length > 0)
      context.addIssue({ code: "custom", path: ["options"], message: "Only choice fields have options." });
    if (field.multiple && !["select", "text", "email", "phone", "url"].includes(field.valueType))
      context.addIssue({ code: "custom", path: ["multiple"], message: "This kind of field holds one value." });
  });
export type SetupNewField = z.infer<typeof SetupNewFieldSchema>;

export const SetupNewRelationshipSchema = z
  .object({
    key: SetupKeySchema,
    source: SetupKeySchema,
    target: SetupKeySchema,
    sourceLabel: LabelSchema,
    targetLabel: LabelSchema,
    sourceCardinality: z.enum(["one", "many"]),
    targetCardinality: z.enum(["one", "many"]),
  })
  .strict();

export const SetupCalculationSchema = z
  .object({
    key: SetupFieldKeySchema,
    label: LabelSchema,
    valueType: z.enum(["number", "currency", "date", "boolean", "text"]),
    expression: BoundedExpressionSchema,
  })
  .strict();
export type SetupCalculation = z.infer<typeof SetupCalculationSchema>;

export const SETUP_PAGE_KINDS = [
  "overview",
  "productsPricing",
  "idealCustomer",
  "salesPlaybook",
  "faq",
  "processes",
  "toneOfVoice",
  "competitor",
] as const;

export const SetupPlanSchema = z
  .object({
    version: z.literal(1),
    workspace: z
      .object({
        currency: z.string().regex(/^[A-Z]{3}$/),
        dashboardAudience: z.enum(["me", "team", "management"]),
      })
      .strict(),
    recordModel: z
      .object({
        lists: z.array(SetupNewListSchema).max(SETUP_PLAN_LIMITS.lists),
        fields: z.array(SetupNewFieldSchema).max(SETUP_PLAN_LIMITS.fields),
        relationships: z.array(SetupNewRelationshipSchema).max(SETUP_PLAN_LIMITS.relationships),
        calculations: z.array(SetupCalculationSchema).max(SETUP_PLAN_LIMITS.calculations),
      })
      .strict(),
    listDefaults: z.array(SetupListDefaultSchema).max(SETUP_PLAN_LIMITS.listDefaults),
    sampleData: z
      .object({
        lists: z
          .array(
            z
              .object({
                list: SetupKeySchema,
                count: z.number().int().min(0).max(SETUP_PLAN_LIMITS.sampleRecords),
                kinds: z.array(LabelSchema).max(5),
              })
              .strict(),
          )
          .max(SETUP_PLAN_LIMITS.sampleLists),
      })
      .strict(),
    dashboard: z.object({ widgets: z.array(SetupWidgetSchema).max(SETUP_PLAN_LIMITS.widgets) }).strict(),
    knowledgeBase: z
      .object({
        pages: z
          .array(
            z
              .object({
                key: SetupKeySchema,
                kind: z.enum(SETUP_PAGE_KINDS),
                title: z.string().trim().min(1).max(120),
                sections: z.array(z.string().trim().min(1).max(200)).min(1).max(SETUP_PLAN_LIMITS.pageSections),
              })
              .strict(),
          )
          .max(SETUP_PLAN_LIMITS.pages),
      })
      .strict(),
    importMapping: z
      .object({
        list: SetupKeySchema,
        columns: z
          .array(
            z.object({ column: z.string().trim().min(1).max(120), field: SetupFieldKeySchema.nullable() }).strict(),
          )
          .min(1)
          .max(SETUP_PLAN_LIMITS.importColumns),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .superRefine((plan, context) => {
    const issue = (path: (string | number)[], message: string) => context.addIssue({ code: "custom", path, message });
    const model = plan.recordModel;
    const lists = new Set<string>();
    model.lists.forEach((list, index) => {
      if (list.key === SETUP_LINE_ITEM_LIST || lists.has(list.key))
        issue(["recordModel", "lists", index, "key"], "The list key is taken.");
      lists.add(list.key);
    });
    for (const role of SETUP_LIST_ROLES) {
      const count = model.lists.filter((list) => list.role === role).length;
      if (SETUP_REQUIRED_LIST_ROLES.includes(role) ? count !== 1 : count > 1) {
        issue(
          ["recordModel", "lists"],
          SETUP_REQUIRED_LIST_ROLES.includes(role)
            ? `Mark exactly one list with the role ${role}.`
            : `Mark at most one list with the role ${role}.`,
        );
      }
    }
    const anchors = new Set(setupAnchorFields(plan.recordModel.lists));
    const fields = new Set<string>();
    const declare = (key: string, path: (string | number)[]) => {
      const [list, name] = key.split(".");
      if (anchors.has(key)) issue(path, "The field is added automatically; do not declare it.");
      else if (fields.has(key) || name === "name") issue(path, "The field key is taken.");
      if (!lists.has(list)) issue(path, "The field belongs to an unknown list.");
      fields.add(key);
    };
    model.fields.forEach((field, index) => declare(field.key, ["recordModel", "fields", index, "key"]));
    model.calculations.forEach((field, index) => declare(field.key, ["recordModel", "calculations", index, "key"]));
    const relationships = new Set<string>();
    model.relationships.forEach((relation, index) => {
      if (relationships.has(relation.key))
        issue(["recordModel", "relationships", index, "key"], "The relationship key is taken.");
      if (!lists.has(relation.source) || !lists.has(relation.target))
        issue(["recordModel", "relationships", index], "The relationship connects an unknown list.");
      relationships.add(relation.key);
    });
    plan.listDefaults.forEach((value, index) => {
      if (!lists.has(value.list)) issue(["listDefaults", index, "list"], "Unknown list.");
    });
    if (new Set(plan.listDefaults.map((value) => value.list)).size !== plan.listDefaults.length)
      issue(["listDefaults"], "Each list has one default.");
    plan.dashboard.widgets.forEach((widget, index) => {
      if (!lists.has(widget.list)) issue(["dashboard", "widgets", index, "list"], "Unknown list.");
    });
    if (new Set(plan.dashboard.widgets.map((widget) => widget.key)).size !== plan.dashboard.widgets.length)
      issue(["dashboard", "widgets"], "Widget keys repeat.");
    plan.sampleData.lists.forEach((value, index) => {
      if (!lists.has(value.list)) issue(["sampleData", "lists", index, "list"], "Unknown list.");
    });
    if (new Set(plan.knowledgeBase.pages.map((page) => page.key)).size !== plan.knowledgeBase.pages.length)
      issue(["knowledgeBase", "pages"], "Page keys repeat.");
    if (plan.importMapping && !lists.has(plan.importMapping.list)) issue(["importMapping", "list"], "Unknown list.");
  });
export type SetupPlan = z.infer<typeof SetupPlanSchema>;
export type SetupPlanInput = z.input<typeof SetupPlanSchema>;
