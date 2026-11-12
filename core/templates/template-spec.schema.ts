import { z } from "zod";

import { CHIP_COLORS } from "@/constants/chip-colors";
import { CAPABILITIES } from "@/core/capabilities/capabilities";
import { RECORD_MEASURE_DATE_INTERVALS } from "@/features/records/record-measure.schema";
import { CALENDAR_WIDGET_LAYOUTS } from "@/features/widget/record-calendar-widget.schema";
import { WIDGET_STARTER_DISPLAY_TYPES } from "@/features/widget/widget-display-rules";
import { SETUP_LIST_ROLES } from "@/features/workspace-setup/setup-anchors";
import {
  SETUP_FIELD_VALUE_TYPES,
  SETUP_PAGE_KINDS,
  SETUP_PLAN_LIMITS,
} from "@/features/workspace-setup/setup-plan.schema";
import { isAppLocale } from "@/i18n/locale-registry";

import { MAX_PLAN_KEY_LENGTH, camelKey } from "./template-keys";
import { addTemplateSpecIssues } from "./template-validation";

export const TEMPLATE_SCHEMA_VERSION = 1;
export const TEMPLATE_FAMILIES = [
  "sales",
  "clients",
  "property",
  "recruiting",
  "professional-services",
  "operations",
  "content",
  "intake",
  "community",
  "trades",
  "investing",
  "custom",
] as const;
export const TEMPLATE_KINDS = ["pipeline", "tracker", "register", "checklist"] as const;
export const TEMPLATE_STATUSES = ["draft", "reviewed", "published"] as const;
export const TEMPLATE_PUBLIC_PAGES = ["own", "proof", "none"] as const;
export const TEMPLATE_PUBLISH_WAVES = ["wave1", "wave2", "hold"] as const;
export const TEMPLATE_FIELD_TYPES = [...SETUP_FIELD_VALUE_TYPES, "file", "dateRange", "channels"] as const;
export const TEMPLATE_RULE_NEEDS = ["today", ...CAPABILITIES] as const;
export const TEMPLATE_SYSTEM_COLUMNS = ["system:createdAt", "system:updatedAt", "system:assignedTo"] as const;
export const TEMPLATE_ACCEPTANCE_KINDS = [
  "list_exists",
  "field_exists",
  "view_exists",
  "widget_exists",
  "rule_exists",
  "page_exists",
] as const;
export const TEMPLATE_LIMITS = {
  ...SETUP_PLAN_LIMITS,
  nameLength: 80,
  summaryLength: 300,
  descriptionLength: 1_000,
  promptIntroLength: 1_500,
  promptQuestions: 8,
  promptQuestionLength: 300,
  ruleTitleLength: 160,
  ruleDescriptionLength: 500,
  checkLength: 300,
} as const;

const NAME_PATTERN = "[a-z][a-z0-9]*(?:_[a-z0-9]+)*";
const KEY_PATTERN = new RegExp(`^${NAME_PATTERN}$`);
const FIELD_REF_PATTERN = new RegExp(`^${NAME_PATTERN}\\.${NAME_PATTERN}$`);
const SLUG_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PLAN_KEY_MESSAGE = `Keys become camelCase plan keys of at most ${MAX_PLAN_KEY_LENGTH} characters.`;

export const TemplateKeySchema = z
  .string()
  .regex(KEY_PATTERN, "Use lowercase snake_case.")
  .refine((key) => camelKey(key).length <= MAX_PLAN_KEY_LENGTH, PLAN_KEY_MESSAGE);

export const TemplateFieldRefSchema = z
  .string()
  .regex(FIELD_REF_PATTERN, "Use list_key.field_key.")
  .refine((ref) => ref.split(".").every((part) => camelKey(part).length <= MAX_PLAN_KEY_LENGTH), PLAN_KEY_MESSAGE);

const FieldOrSystemSchema = z.union([TemplateFieldRefSchema, z.enum(TEMPLATE_SYSTEM_COLUMNS)]);
const DateSchema = z.string().regex(DATE_PATTERN, "Use YYYY-MM-DD.");
const ChipColorSchema = z.enum(CHIP_COLORS);
const LabelSchema = z.string().trim().min(1).max(TEMPLATE_LIMITS.nameLength);

function localeRecord<T extends z.ZodType>(value: T) {
  return z
    .record(z.string(), value)
    .refine((record) => Object.keys(record).every((key) => isAppLocale(key)), "Keys must be app locales.");
}

export type TemplateExpression =
  | { op: "field"; field: string }
  | { op: "number"; value: string }
  | { op: "add" | "subtract" | "multiply" | "divide"; left: TemplateExpression; right: TemplateExpression }
  | { op: "optionWeight"; field: string }
  | { op: "daysBetween"; from: string; to: string }
  | {
      op: "related";
      relationship: string;
      direction: "outgoing" | "incoming";
      field: string;
      reducer: "one" | "sum" | "count" | "average" | "min" | "max";
    };

const TemplateExpressionSchema: z.ZodType<TemplateExpression> = z.lazy(() =>
  z.discriminatedUnion("op", [
    z.strictObject({ op: z.literal("field"), field: TemplateFieldRefSchema }),
    z.strictObject({ op: z.literal("number"), value: z.string().regex(/^-?(?:0|[1-9]\d{0,14})(?:\.\d{1,6})?$/) }),
    z.strictObject({
      op: z.enum(["add", "subtract", "multiply", "divide"]),
      left: TemplateExpressionSchema,
      right: TemplateExpressionSchema,
    }),
    z.strictObject({ op: z.literal("optionWeight"), field: TemplateFieldRefSchema }),
    z.strictObject({ op: z.literal("daysBetween"), from: TemplateFieldRefSchema, to: TemplateFieldRefSchema }),
    z.strictObject({
      op: z.literal("related"),
      relationship: TemplateKeySchema,
      direction: z.enum(["outgoing", "incoming"]),
      field: TemplateFieldRefSchema,
      reducer: z.enum(["one", "sum", "count", "average", "min", "max"]),
    }),
  ]),
);

const OptionSchema = z.strictObject({ key: TemplateKeySchema, color: ChipColorSchema.optional() });

const StageItemSchema = z.strictObject({
  key: TemplateKeySchema,
  color: ChipColorSchema.optional(),
  outcome: z.enum(["open", "won", "lost"]).optional(),
  weight: z.number().int().min(0).max(100).optional(),
});

const ListSchema = z.strictObject({
  key: TemplateKeySchema,
  role: z.enum(SETUP_LIST_ROLES).optional(),
  icon: z.string().regex(/^[a-z][a-zA-Z]{0,39}$/),
  color: ChipColorSchema.optional(),
});

const FieldSchema = z.strictObject({
  key: TemplateFieldRefSchema,
  type: z.enum(TEMPLATE_FIELD_TYPES),
  required: z.boolean().default(false),
  multiple: z.boolean().default(false),
  options: z.array(OptionSchema).max(TEMPLATE_LIMITS.options).default([]),
});

const StageSchema = z.strictObject({
  field: TemplateFieldRefSchema,
  items: z.array(StageItemSchema).min(2).max(TEMPLATE_LIMITS.options),
});

const CalculationSchema = z.strictObject({
  key: TemplateFieldRefSchema,
  type: z.enum(["number", "currency", "date", "boolean", "text"]),
  expression: TemplateExpressionSchema,
});

const RelationshipSchema = z.strictObject({
  key: TemplateKeySchema,
  source: TemplateKeySchema,
  target: TemplateKeySchema,
  sourceCardinality: z.enum(["one", "many"]),
  targetCardinality: z.enum(["one", "many"]),
});

export const TemplateFilterSchema = z.discriminatedUnion("operator", [
  z.strictObject({
    operator: z.enum(["in", "notIn"]),
    field: TemplateFieldRefSchema,
    options: z.array(TemplateKeySchema).min(1).max(TEMPLATE_LIMITS.options),
  }),
  z.strictObject({
    operator: z.enum(["inLastDays", "notInLastDays"]),
    field: FieldOrSystemSchema,
    days: z.number().int().min(1).max(3_650),
  }),
  z.strictObject({ operator: z.enum(["empty", "notEmpty"]), field: FieldOrSystemSchema }),
]);

const ViewSchema = z.strictObject({
  key: TemplateKeySchema,
  list: TemplateKeySchema,
  default: z.boolean(),
  layout: z.enum(["table", "board"]),
  groupBy: FieldOrSystemSchema.nullable().default(null),
  sort: z
    .strictObject({ field: FieldOrSystemSchema, direction: z.enum(["asc", "desc"]) })
    .nullable()
    .default(null),
  columns: z.array(TemplateFieldRefSchema).max(TEMPLATE_LIMITS.columns).default([]),
  summaries: z
    .array(z.strictObject({ field: TemplateFieldRefSchema, aggregation: z.enum(["sum", "average", "min", "max"]) }))
    .max(4)
    .default([]),
  filters: z.array(TemplateFilterSchema).max(TEMPLATE_LIMITS.widgetFilters).default([]),
});

const ChartWidgetSchema = z.strictObject({
  kind: z.literal("chart"),
  key: TemplateKeySchema,
  list: TemplateKeySchema,
  aggregation: z.enum(["count", "sum", "average", "min", "max"]),
  valueField: TemplateFieldRefSchema.nullable().default(null),
  groupBy: z
    .strictObject({
      path: z
        .array(z.strictObject({ relationship: TemplateKeySchema, direction: z.enum(["outgoing", "incoming"]) }))
        .max(2)
        .default([]),
      field: FieldOrSystemSchema.nullable().default(null),
      dateInterval: z.enum(RECORD_MEASURE_DATE_INTERVALS).optional(),
    })
    .nullable()
    .default(null),
  filters: z.array(TemplateFilterSchema).max(TEMPLATE_LIMITS.widgetFilters).default([]),
  display: z.enum(WIDGET_STARTER_DISPLAY_TYPES),
  size: z.enum(["small", "medium", "large", "wide"]).optional(),
});

const CalendarWidgetSchema = z.strictObject({
  kind: z.literal("calendar"),
  key: TemplateKeySchema,
  list: TemplateKeySchema,
  layout: z.enum(CALENDAR_WIDGET_LAYOUTS),
  dateField: TemplateFieldRefSchema,
  amountField: TemplateFieldRefSchema.nullable().default(null),
  filters: z.array(TemplateFilterSchema).max(TEMPLATE_LIMITS.widgetFilters).default([]),
});

const MapWidgetSchema = z.strictObject({
  kind: z.literal("map"),
  key: TemplateKeySchema,
  list: TemplateKeySchema,
  addressField: TemplateFieldRefSchema,
  colorField: TemplateFieldRefSchema.nullable().default(null),
  sizeField: TemplateFieldRefSchema.nullable().default(null),
  detailField: TemplateFieldRefSchema.nullable().default(null),
  filters: z.array(TemplateFilterSchema).max(TEMPLATE_LIMITS.widgetFilters).default([]),
});

const ActivityWidgetSchema = z.strictObject({ kind: z.literal("activity"), key: TemplateKeySchema });

export const TemplateWidgetSchema = z.discriminatedUnion("kind", [
  ChartWidgetSchema,
  CalendarWidgetSchema,
  MapWidgetSchema,
  ActivityWidgetSchema,
]);

const KnowledgePageSchema = z.strictObject({
  key: TemplateKeySchema,
  kind: z.enum([...SETUP_PAGE_KINDS, "competitor"]),
});

export const RuleTriggerSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("record_created"), list: TemplateKeySchema }),
  z.strictObject({ kind: z.literal("field_changed"), field: TemplateFieldRefSchema, to: TemplateKeySchema.optional() }),
  z.strictObject({
    kind: z.literal("date_reached"),
    field: TemplateFieldRefSchema,
    offsetDays: z.number().int().min(-3_650).max(3_650),
  }),
  z.strictObject({
    kind: z.literal("unchanged_for"),
    field: TemplateFieldRefSchema,
    days: z.number().int().min(1).max(3_650),
  }),
  z.strictObject({
    kind: z.literal("schedule"),
    every: z.enum(["day", "week", "month"]),
    weekday: z.number().int().min(1).max(7).optional(),
    list: TemplateKeySchema.optional(),
  }),
  z.strictObject({ kind: z.literal("form_submitted"), form: TemplateKeySchema }),
  z.strictObject({ kind: z.literal("webhook_received"), source: TemplateKeySchema }),
]);

export const RuleConditionSchema = z.discriminatedUnion("operator", [
  z.strictObject({
    operator: z.enum(["in", "notIn"]),
    field: TemplateFieldRefSchema,
    options: z.array(TemplateKeySchema).min(1).max(TEMPLATE_LIMITS.options),
  }),
  z.strictObject({ operator: z.enum(["empty", "notEmpty", "passed"]), field: TemplateFieldRefSchema }),
  z.strictObject({
    operator: z.literal("olderThanDays"),
    field: TemplateFieldRefSchema,
    days: z.number().int().min(1).max(3_650),
  }),
]);

export const RuleActionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("create_task"),
    taskKind: TemplateKeySchema,
    assignee: z.enum(["record_owner", "workspace_owner"]),
    about: TemplateKeySchema.optional(),
  }),
  z.strictObject({ kind: z.literal("notify"), recipient: z.enum(["record_owner", "workspace_owner"]) }),
  z.strictObject({ kind: z.literal("add_calendar_event"), dateField: TemplateFieldRefSchema }),
  z.strictObject({ kind: z.literal("create_records"), lists: z.array(TemplateKeySchema).min(1).max(4) }),
  z.strictObject({
    kind: z.literal("set_dates"),
    dates: z
      .array(z.strictObject({ field: TemplateFieldRefSchema, offsetDays: z.number().int().min(-3_650).max(3_650) }))
      .min(1)
      .max(4),
  }),
]);

const COUNTRY_PATTERN = /^[A-Z]{2}$/;
const DueOffsetDaysSchema = z.number().int().min(0).max(3_650);
const CountryKeySchema = z.string().regex(COUNTRY_PATTERN, "Use an ISO 3166-1 alpha-2 country code in capitals.");

const RuleVariantSchema = z
  .strictObject({
    trigger: RuleTriggerSchema.optional(),
    condition: z.array(RuleConditionSchema).max(4).optional(),
    action: RuleActionSchema.optional(),
    dueOffsetDays: DueOffsetDaysSchema.optional(),
  })
  .refine((variant) => Object.keys(variant).length > 0, "A variant changes at least one part of the rule.");

const FollowUpRuleSchema = z.strictObject({
  key: TemplateKeySchema,
  trigger: RuleTriggerSchema,
  condition: z.array(RuleConditionSchema).max(4).default([]),
  action: RuleActionSchema,
  dueOffsetDays: DueOffsetDaysSchema,
  needs: z.enum(TEMPLATE_RULE_NEEDS),
  variants: z.record(CountryKeySchema, RuleVariantSchema).optional(),
});

const AcceptanceCheckSchema = z.strictObject({
  key: TemplateKeySchema,
  kind: z.enum(TEMPLATE_ACCEPTANCE_KINDS),
  ref: z.string().min(1).max(60),
});

const SourceSchema = z.strictObject({ url: z.url(), checkedOn: DateSchema });

const TemplateBodyShape = {
  modules: z.array(TemplateKeySchema).default([]),
  lists: z.array(ListSchema).default([]),
  fields: z.array(FieldSchema).default([]),
  stages: z.array(StageSchema).default([]),
  calculations: z.array(CalculationSchema).default([]),
  relationships: z.array(RelationshipSchema).default([]),
  views: z.array(ViewSchema).default([]),
  widgets: z.array(TemplateWidgetSchema).default([]),
  knowledgePages: z.array(KnowledgePageSchema).default([]),
  followUpRules: z.array(FollowUpRuleSchema).default([]),
  acceptanceChecks: z.array(AcceptanceCheckSchema).default([]),
};

export const TemplateSpecObjectSchema = z.strictObject({
  id: z.string().regex(/^tpl_[a-z0-9_]+$/),
  version: z.number().int().min(1),
  schemaVersion: z.literal(TEMPLATE_SCHEMA_VERSION),
  slug: z.string().regex(SLUG_PATTERN).max(48),
  family: z.enum(TEMPLATE_FAMILIES),
  kind: z.enum(TEMPLATE_KINDS),
  jurisdictions: z
    .array(z.string().regex(/^(?:global|[A-Z]{2})$/))
    .min(1)
    .max(12),
  dashboardAudience: z.enum(["me", "team", "management"]).default("team"),
  requiresCapabilities: z.array(z.enum(CAPABILITIES)).max(CAPABILITIES.length),
  pairedPages: localeRecord(z.string().regex(/^\/(?:for|features)\/[a-z0-9-]+$/)),
  ...TemplateBodyShape,
  sources: z.array(SourceSchema).min(1).max(30),
  reviewedAt: DateSchema,
  status: localeRecord(z.enum(TEMPLATE_STATUSES)),
  publicPage: localeRecord(z.enum(TEMPLATE_PUBLIC_PAGES)),
  publishWave: localeRecord(z.enum(TEMPLATE_PUBLISH_WAVES)).default({}),
});
export type TemplateSpecObject = z.output<typeof TemplateSpecObjectSchema>;

export const TemplateSpecSchema = TemplateSpecObjectSchema.superRefine(addTemplateSpecIssues);
export type TemplateSpec = TemplateSpecObject;
export type TemplateSpecInput = z.input<typeof TemplateSpecObjectSchema>;
export type TemplateList = TemplateSpec["lists"][number];
export type TemplateField = TemplateSpec["fields"][number];
export type TemplateStage = TemplateSpec["stages"][number];
export type TemplateView = TemplateSpec["views"][number];
export type TemplateWidget = TemplateSpec["widgets"][number];
export type TemplateFilter = z.output<typeof TemplateFilterSchema>;
export type TemplateRule = TemplateSpec["followUpRules"][number];
export type TemplateRuleNeed = (typeof TEMPLATE_RULE_NEEDS)[number];
export type TemplateAcceptanceCheck = TemplateSpec["acceptanceChecks"][number];

export const TemplateModuleSchema = z.strictObject({
  key: TemplateKeySchema,
  description: z.string().trim().min(1).max(300),
  ...TemplateBodyShape,
  text: localeRecord(z.record(z.string(), z.unknown())),
});
export type TemplateModule = z.output<typeof TemplateModuleSchema>;

const ListTextSchema = z.strictObject({
  label: LabelSchema,
  pluralLabel: LabelSchema,
  description: z
    .string()
    .trim()
    .max(TEMPLATE_LIMITS.nameLength * 6)
    .default(""),
});

const FieldTextSchema = z.strictObject({
  label: LabelSchema,
  options: z.record(z.string(), LabelSchema).default({}),
  rangeLabels: z.strictObject({ from: LabelSchema, to: LabelSchema }).optional(),
});

const PageTextSchema = z.strictObject({
  title: z.string().trim().min(1).max(120),
  sections: z.array(z.string().trim().min(1).max(200)).min(1).max(TEMPLATE_LIMITS.pageSections),
});

const RuleTitleSchema = z.string().trim().min(1).max(TEMPLATE_LIMITS.ruleTitleLength);
const RuleDescriptionSchema = z.string().trim().max(TEMPLATE_LIMITS.ruleDescriptionLength);

const RuleTextSchema = z.strictObject({
  title: RuleTitleSchema,
  description: RuleDescriptionSchema.default(""),
  variants: z
    .record(
      CountryKeySchema,
      z.strictObject({ title: RuleTitleSchema, description: RuleDescriptionSchema.default("") }),
    )
    .optional(),
});

export const TemplateTextBodyShape = {
  lists: z.record(z.string(), ListTextSchema).default({}),
  fields: z.record(z.string(), FieldTextSchema).default({}),
  relationships: z
    .record(z.string(), z.strictObject({ sourceLabel: LabelSchema, targetLabel: LabelSchema }))
    .default({}),
  views: z.record(z.string(), z.strictObject({ name: LabelSchema })).default({}),
  widgets: z.record(z.string(), z.strictObject({ title: LabelSchema })).default({}),
  knowledgePages: z.record(z.string(), PageTextSchema).default({}),
  rules: z.record(z.string(), RuleTextSchema).default({}),
  acceptanceChecks: z.record(z.string(), z.string().trim().min(1).max(TEMPLATE_LIMITS.checkLength)).default({}),
};

export const TEMPLATE_PAGE_LIMITS = {
  metaTitleMin: 30,
  metaTitleMax: 60,
  metaDescriptionMin: 70,
  metaDescriptionMax: 158,
  headlineLength: 120,
  answerLength: 600,
  routineSteps: 6,
  stepLength: 300,
  limits: 8,
  limitLength: 300,
  faqItems: 8,
  questionLength: 200,
  faqAnswerLength: 900,
} as const;

export const TemplatePageTextSchema = z.strictObject({
  metaTitle: z.string().trim().min(TEMPLATE_PAGE_LIMITS.metaTitleMin).max(TEMPLATE_PAGE_LIMITS.metaTitleMax),
  metaDescription: z
    .string()
    .trim()
    .min(TEMPLATE_PAGE_LIMITS.metaDescriptionMin)
    .max(TEMPLATE_PAGE_LIMITS.metaDescriptionMax),
  headline: z.string().trim().min(1).max(TEMPLATE_PAGE_LIMITS.headlineLength),
  answer: z.string().trim().min(1).max(TEMPLATE_PAGE_LIMITS.answerLength),
  routine: z.strictObject({
    title: z.string().trim().min(1).max(TEMPLATE_PAGE_LIMITS.headlineLength),
    steps: z
      .array(z.string().trim().min(1).max(TEMPLATE_PAGE_LIMITS.stepLength))
      .min(2)
      .max(TEMPLATE_PAGE_LIMITS.routineSteps),
  }),
  limits: z
    .array(z.string().trim().min(1).max(TEMPLATE_PAGE_LIMITS.limitLength))
    .min(1)
    .max(TEMPLATE_PAGE_LIMITS.limits),
  faq: z
    .array(
      z.strictObject({
        question: z.string().trim().min(1).max(TEMPLATE_PAGE_LIMITS.questionLength),
        answer: z.string().trim().min(1).max(TEMPLATE_PAGE_LIMITS.faqAnswerLength),
      }),
    )
    .min(2)
    .max(TEMPLATE_PAGE_LIMITS.faqItems),
});
export type TemplatePageText = z.output<typeof TemplatePageTextSchema>;

export const TemplateLocaleSchema = z.strictObject({
  locale: z.string().refine((value) => isAppLocale(value), "Must be an app locale."),
  name: LabelSchema,
  summary: z.string().trim().min(1).max(TEMPLATE_LIMITS.summaryLength),
  description: z.string().trim().min(1).max(TEMPLATE_LIMITS.descriptionLength),
  ...TemplateTextBodyShape,
  page: TemplatePageTextSchema.optional(),
  prompt: z.strictObject({
    intro: z.string().trim().min(1).max(TEMPLATE_LIMITS.promptIntroLength),
    questions: z
      .array(z.string().trim().min(1).max(TEMPLATE_LIMITS.promptQuestionLength))
      .min(1)
      .max(TEMPLATE_LIMITS.promptQuestions),
  }),
});
export type TemplateLocale = z.output<typeof TemplateLocaleSchema>;
export type TemplateLocaleInput = z.input<typeof TemplateLocaleSchema>;

export const TemplateModuleTextSchema = z.strictObject(TemplateTextBodyShape);
export type TemplateModuleText = z.output<typeof TemplateModuleTextSchema>;

export const TemplateBundleSchema = z.strictObject({
  spec: TemplateSpecSchema,
  text: localeRecord(TemplateLocaleSchema),
});
export type TemplateBundle = z.output<typeof TemplateBundleSchema>;
