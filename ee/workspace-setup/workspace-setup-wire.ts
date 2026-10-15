import type { SetupAnswerValue, SetupAnswers } from "@/features/workspace-setup/setup-answers.schema";
import type { SetupPlan } from "@/features/workspace-setup/setup-plan.schema";
import type { SetupFollowUpQuestion } from "./workspace-setup.schema";

import { z } from "zod";

import { CHIP_COLORS } from "@/constants/chip-colors";
import { RECORD_MEASURE_DATE_INTERVALS } from "@/features/records/record-measure.schema";
import { SetupAnswersSchema } from "@/features/workspace-setup/setup-answers.schema";
import {
  SETUP_QUESTION_FORMATS,
  SETUP_MAX_FOLLOW_UP_QUESTIONS,
  setupPart,
} from "@/features/workspace-setup/setup-interview";
import {
  SETUP_FIELD_VALUE_TYPES,
  SETUP_PAGE_KINDS,
  SETUP_PLAN_LIMITS,
  SetupFieldKeySchema,
  SetupPlanSchema,
} from "@/features/workspace-setup/setup-plan.schema";
import { SETUP_LIST_ROLES } from "@/features/workspace-setup/setup-anchors";
import { WIDGET_STARTER_DISPLAY_TYPES } from "@/features/widget/widget-display-rules";
import { APP_LOCALES } from "@/i18n/locale-registry";
import { SETUP_FOLLOW_UP_IDS, SetupFollowUpQuestionSchema } from "./workspace-setup.schema";

const AnswerFields = {
  confidence: z.number().describe("0 to 1."),
  choice: z.string().nullable().describe("singleChoice: the option id."),
  choices: z.array(z.string()).describe("multipleChoice or rankedPick: option ids in order."),
  custom: z.array(z.string()).describe("multipleChoice: own entries when allowCustom."),
  items: z
    .array(z.object({ label: z.string(), winChance: z.number().nullable() }))
    .describe("orderedList: entries in order."),
  min: z.number().nullable().describe("range: the number, or the lower bound."),
  max: z.number().nullable().describe("range: the upper bound, null for one number."),
  text: z.string().nullable().describe("shortText: the text."),
};

export const PrefillWireSchema = z.object({
  answers: z.array(z.object({ part: z.string(), ...AnswerFields })),
});
export type PrefillWire = z.infer<typeof PrefillWireSchema>;

type WireAnswer = Omit<PrefillWire["answers"][number], "part" | "confidence">;

export function wireAnswerValue(format: (typeof SETUP_QUESTION_FORMATS)[number], wire: WireAnswer): SetupAnswerValue {
  switch (format) {
    case "singleChoice":
      return { format, value: wire.choice ?? "" };
    case "multipleChoice":
      return { format, values: wire.choices, custom: wire.custom };
    case "orderedList":
      return {
        format,
        items: wire.items.map((item) => ({
          label: item.label,
          ...(item.winChance === null ? {} : { winChance: Math.round(item.winChance) }),
        })),
      };
    case "rankedPick":
      return { format, values: wire.choices };
    case "range":
      return { format, min: wire.min ?? 0, max: wire.max };
    case "shortText":
      return { format, value: wire.text ?? "" };
  }
}

const COUNTRY = /^[A-Z]{2}$/;
const CURRENCY = /^[A-Z]{3}$/;

function optionSourceValid(part: string, value: SetupAnswerValue): boolean {
  if (value.format !== "singleChoice") return true;
  if (part === "country") return COUNTRY.test(value.value);
  if (part === "currency") return CURRENCY.test(value.value);
  if (part === "language") return (APP_LOCALES as readonly string[]).includes(value.value);
  return true;
}

export function prefillAnswers(wire: PrefillWire): SetupAnswers {
  const answers: SetupAnswers = {};
  for (const entry of wire.answers) {
    const part = setupPart(entry.part);
    if (!part || part.prefill === "no" || answers[entry.part]) continue;
    const ownEntriesOnly = part.format === "multipleChoice" && part.options.length === 0;
    const value = wireAnswerValue(
      part.format,
      ownEntriesOnly ? { ...entry, choices: [], custom: [...entry.custom, ...entry.choices] } : entry,
    );
    if (!optionSourceValid(entry.part, value)) continue;
    const candidate = {
      [entry.part]: { source: "website" as const, confidence: Math.min(1, Math.max(0, entry.confidence)), value },
    };
    const parsed = SetupAnswersSchema.safeParse(candidate);
    if (parsed.success) Object.assign(answers, parsed.data);
  }
  return answers;
}

export const FollowUpWireSchema = z.object({
  questions: z.array(
    z.object({
      label: z.string(),
      format: z.enum(SETUP_QUESTION_FORMATS),
      options: z.array(z.object({ id: z.string(), label: z.string() })),
      allowCustom: z.boolean(),
      winChance: z.boolean(),
      maxItems: z.number().nullable(),
      maxPicks: z.number().nullable(),
      suggestions: z.array(z.string()),
      unit: z.enum(["currency", "days"]).nullable(),
      single: z.boolean(),
      min: z.number().nullable(),
      max: z.number().nullable(),
      maxLength: z.number().nullable(),
    }),
  ),
});
export type FollowUpWire = z.infer<typeof FollowUpWireSchema>;

export function followUpQuestions(wire: FollowUpWire): SetupFollowUpQuestion[] {
  const questions: SetupFollowUpQuestion[] = [];
  for (const entry of wire.questions) {
    if (questions.length >= SETUP_MAX_FOLLOW_UP_QUESTIONS) break;
    const id = SETUP_FOLLOW_UP_IDS[questions.length];
    const base = { id, label: entry.label, format: entry.format };
    const candidate =
      entry.format === "singleChoice"
        ? { ...base, options: entry.options }
        : entry.format === "multipleChoice"
          ? { ...base, options: entry.options, allowCustom: entry.allowCustom }
          : entry.format === "orderedList"
            ? {
                ...base,
                winChance: entry.winChance,
                maxItems: Math.round(entry.maxItems ?? 10),
                suggestions: entry.suggestions,
              }
            : entry.format === "rankedPick"
              ? { ...base, options: entry.options, maxPicks: Math.round(entry.maxPicks ?? 3) }
              : entry.format === "range"
                ? {
                    ...base,
                    unit: entry.unit ?? "currency",
                    single: entry.single,
                    min: entry.min ?? 0,
                    max: entry.max ?? 0,
                  }
                : { ...base, maxLength: Math.round(entry.maxLength ?? 300) };
    const parsed = SetupFollowUpQuestionSchema.safeParse(candidate);
    if (parsed.success) questions.push(parsed.data);
  }
  return questions;
}

export function followUpAnswerIssue(question: SetupFollowUpQuestion, value: SetupAnswerValue): string | null {
  if (value.format !== question.format) return "The answer does not match the question format.";
  const known = (id: string) => "options" in question && question.options.some((option) => option.id === id);
  if (value.format === "singleChoice" && !known(value.value)) return "Unknown option.";
  if (value.format === "multipleChoice") {
    if (value.values.some((id) => !known(id))) return "Unknown option.";
    if (question.format === "multipleChoice" && !question.allowCustom && value.custom.length)
      return "This question takes no own entries.";
  }
  if (value.format === "rankedPick" && question.format === "rankedPick") {
    if (value.values.some((id) => !known(id))) return "Unknown option.";
    if (value.values.length > question.maxPicks) return "Too many picks.";
  }
  if (value.format === "orderedList" && question.format === "orderedList") {
    if (value.items.length > question.maxItems) return "Too many entries.";
    if (!question.winChance && value.items.some((item) => item.winChance !== undefined))
      return "This list has no win chance.";
  }
  if (value.format === "range" && question.format === "range") {
    if (question.single && value.max !== null) return "This question takes one number.";
    if (value.min < question.min || value.min > question.max || (value.max !== null && value.max > question.max))
      return "The number is out of range.";
  }
  if (value.format === "shortText" && question.format === "shortText" && value.value.length > question.maxLength)
    return "The text is too long.";
  return null;
}

const WireOptionSchema = z.object({
  key: z.string().describe("lowerCamelCase letters and digits only."),
  label: z.string(),
  color: z.enum(CHIP_COLORS).nullable(),
  weight: z.number().nullable(),
  outcome: z.enum(["open", "won", "lost"]).nullable(),
});
const KeyDescription = "lowerCamelCase letters and digits only, at most 24 characters, no dots, dashes or spaces.";
const FieldKeyDescription = "<listKey>.<fieldName>, both lowerCamelCase, such as deal.renewalDate.";
const FieldRefDescription =
  "A field reference such as deal.stage, or system:createdAt, system:updatedAt, system:assignedTo.";
const RoleDescription =
  "people: the list of individual people, exactly one. tasks: the list of to-dos, exactly one. deals: the list of sales opportunities or orders with stages and a money value, at most one. offerings: the catalog of products or services the company sells, at most one. null for every other list.";

const RecordModelWireShape = {
  lists: z.array(
    z.object({
      key: z.string().describe(KeyDescription),
      label: z.string(),
      pluralLabel: z.string(),
      description: z.string(),
      icon: z.string().describe("A lucide icon name in lowerCamelCase, such as kanban or fileText."),
      color: z.enum(CHIP_COLORS).nullable(),
      role: z.enum(SETUP_LIST_ROLES).nullable().describe(RoleDescription),
    }),
  ),
  fields: z.array(
    z.object({
      key: z.string().describe(FieldKeyDescription),
      label: z.string(),
      valueType: z.enum(SETUP_FIELD_VALUE_TYPES),
      required: z.boolean(),
      multiple: z.boolean(),
      options: z.array(WireOptionSchema),
    }),
  ),
  relationships: z.array(
    z.object({
      key: z.string().describe(KeyDescription),
      source: z.string(),
      target: z.string(),
      sourceLabel: z.string().describe("How a source record names its linked target."),
      targetLabel: z.string().describe("How a target record names its linked sources."),
      targetsPerSource: z
        .enum(["one", "many"])
        .describe("How many target records one source record links to: one for the organization of a deal."),
      sourcesPerTarget: z
        .enum(["one", "many"])
        .describe("How many source records may link to one target record: many for the deals of an organization."),
    }),
  ),
  calculations: z.array(
    z.object({
      key: z.string().describe(FieldKeyDescription),
      label: z.string(),
      valueType: z.enum(["number", "currency", "date", "boolean", "text"]),
      expression: z.string().describe("The expression tree as a JSON string."),
    }),
  ),
};
const ListDefaultsWireShape = {
  listDefaults: z.array(
    z.object({
      list: z.string(),
      name: z.string(),
      layout: z.enum(["table", "board"]),
      groupBy: z.string().nullable().describe(FieldRefDescription),
      sort: z.object({ field: z.string(), direction: z.enum(["asc", "desc"]) }).nullable(),
      columns: z.array(z.string()).describe("Field keys of this list in display order; system columns are not listed."),
      summaries: z.array(z.object({ field: z.string(), aggregation: z.enum(["sum", "average", "min", "max"]) })),
    }),
  ),
};
const WidgetsWireShape = {
  widgets: z.array(
    z.object({
      key: z.string().describe("lowerCamelCase letters and digits only."),
      title: z.string(),
      list: z.string(),
      aggregation: z.enum(["count", "sum", "average", "min", "max"]),
      valueField: z.string().nullable(),
      groupBy: z
        .object({
          path: z.array(z.object({ relationship: z.string(), direction: z.enum(["outgoing", "incoming"]) })),
          field: z.string().nullable(),
          dateInterval: z.enum(RECORD_MEASURE_DATE_INTERVALS).nullable(),
        })
        .nullable(),
      filters: z.array(
        z.object({
          operator: z.enum(["in", "notIn", "inLastDays", "notInLastDays", "empty", "notEmpty"]),
          field: z.string(),
          options: z.array(z.string()),
          days: z.number().nullable(),
        }),
      ),
      display: z.enum(WIDGET_STARTER_DISPLAY_TYPES),
      size: z.enum(["small", "medium", "large", "wide"]).nullable(),
    }),
  ),
};

const WorkspaceWireShape = {
  currency: z.string().describe("ISO 4217 code."),
  dashboardAudience: z.enum(["me", "team", "management"]),
};

export const PlanModelWireSchema = z.object({ ...WorkspaceWireShape, ...RecordModelWireShape });
export type PlanModelWire = z.infer<typeof PlanModelWireSchema>;

export const PlanViewsWireSchema = z.object({
  ...ListDefaultsWireShape,
  sampleLists: z.array(
    z.object({
      list: z.string(),
      count: z.number(),
      kinds: z.array(z.string()).describe("Up to five short kinds of records, each a few words."),
    }),
  ),
  ...WidgetsWireShape,
  importMapping: z
    .object({ list: z.string(), columns: z.array(z.object({ column: z.string(), field: z.string().nullable() })) })
    .nullable(),
});
export type PlanViewsWire = z.infer<typeof PlanViewsWireSchema>;

export const PlanKnowledgeWireSchema = z.object({
  pages: z.array(
    z.object({
      key: z.string().describe(KeyDescription),
      kind: z.enum(SETUP_PAGE_KINDS),
      title: z.string(),
      sections: z.array(z.string()).describe("One to twelve section headings."),
    }),
  ),
});
export type PlanKnowledgeWire = z.infer<typeof PlanKnowledgeWireSchema>;

export const PlanWireSchema = z.object({
  workspace: z.object(WorkspaceWireShape),
  recordModel: z.object(RecordModelWireShape),
  ...ListDefaultsWireShape,
  sampleData: z.object({ lists: PlanViewsWireSchema.shape.sampleLists }),
  dashboard: z.object(WidgetsWireShape),
  importMapping: PlanViewsWireSchema.shape.importMapping,
  knowledgeBase: PlanKnowledgeWireSchema,
});
export type PlanWire = z.infer<typeof PlanWireSchema>;

export const EMPTY_PLAN_MODEL_WIRE: PlanModelWire = {
  currency: "EUR",
  dashboardAudience: "me",
  lists: [],
  fields: [],
  relationships: [],
  calculations: [],
};
export const EMPTY_PLAN_VIEWS_WIRE: PlanViewsWire = {
  listDefaults: [],
  sampleLists: [],
  widgets: [],
  importMapping: null,
};
export const EMPTY_PLAN_KNOWLEDGE_WIRE: PlanKnowledgeWire = { pages: [] };

const PART_PATHS: Array<[string, string]> = [
  ["workspace.", ""],
  ["recordModel.", ""],
  ["sampleData.lists", "sampleLists"],
  ["dashboard.widgets", "widgets"],
  ["knowledgeBase.", ""],
];

export function planPartPath(path: string): string {
  const match = PART_PATHS.find(([prefix]) => path.startsWith(prefix));
  return match ? match[1] + path.slice(match[0].length) : path;
}

export function planWireFromParts(model: PlanModelWire, views: PlanViewsWire, knowledge: PlanKnowledgeWire): PlanWire {
  const { currency, dashboardAudience, ...recordModel } = model;
  return {
    workspace: { currency, dashboardAudience },
    recordModel,
    listDefaults: views.listDefaults,
    sampleData: { lists: views.sampleLists },
    dashboard: { widgets: views.widgets },
    importMapping: views.importMapping,
    knowledgeBase: knowledge,
  };
}

function present<T>(value: T | null): T | undefined {
  return value === null ? undefined : value;
}

function option(entry: z.infer<typeof WireOptionSchema>) {
  return {
    key: entry.key,
    label: entry.label,
    ...(entry.color ? { color: entry.color } : {}),
    ...(entry.weight === null ? {} : { weight: Math.round(entry.weight) }),
    ...(entry.outcome ? { outcome: entry.outcome } : {}),
  };
}

const KEY_CHARACTERS = 24;

export function lowerCamelKey(value: string): string {
  const words = value.normalize("NFKD").match(/[A-Za-z0-9]+/gu) ?? [];
  const first = words.findIndex((word) => /^[A-Za-z]/u.test(word));
  const key = words
    .slice(Math.max(0, first))
    .map((word, index) => (index === 0 ? word.charAt(0).toLowerCase() : word.charAt(0).toUpperCase()) + word.slice(1))
    .join("")
    .slice(0, KEY_CHARACTERS);
  return first < 0 || !key ? value : key;
}

const SAMPLE_KINDS = 5;
const SAMPLE_KIND_CHARACTERS = 80;

function numberLiterals(node: unknown): unknown {
  if (!node || typeof node !== "object" || Array.isArray(node)) return node;
  const entries = Object.entries(node).map(([key, value]) => [
    key,
    key === "value" && typeof value === "number" ? String(value) : numberLiterals(value),
  ]);
  return Object.fromEntries(entries);
}

function expression(value: string): unknown {
  try {
    return numberLiterals(JSON.parse(value));
  } catch {
    return value;
  }
}

export function planFromWire(
  wire: PlanWire,
): { ok: true; plan: SetupPlan } | { ok: false; issues: Array<{ path: string; message: string }> } {
  const model = wire.recordModel;
  const newLists = new Set(model.lists.map((list) => list.key));
  const input = {
    version: 1,
    workspace: wire.workspace,
    recordModel: {
      lists: model.lists.map((list) => ({ ...list, color: present(list.color), role: present(list.role) })),
      fields: model.fields
        .filter((field) => {
          const [list, name] = field.key.split(".");
          return name !== "name" || !newLists.has(list);
        })
        .map((field) => ({ ...field, options: field.options.map(option) })),
      relationships: model.relationships.map(({ targetsPerSource, sourcesPerTarget, ...relation }) => ({
        ...relation,
        sourceCardinality: targetsPerSource,
        targetCardinality: sourcesPerTarget,
      })),
      calculations: model.calculations.map((calculation) => ({
        ...calculation,
        expression: expression(calculation.expression),
      })),
    },
    listDefaults: wire.listDefaults
      .filter((value, index) => wire.listDefaults.findIndex((other) => other.list === value.list) === index)
      .map((value) => ({
        ...value,
        columns: value.columns.filter((column) => SetupFieldKeySchema.safeParse(column).success),
        summaries: value.groupBy ? value.summaries : [],
      })),
    sampleData: {
      lists: wire.sampleData.lists.map((list) => ({
        ...list,
        count: Math.round(list.count),
        kinds: list.kinds.slice(0, SAMPLE_KINDS).map((kind) => kind.slice(0, SAMPLE_KIND_CHARACTERS).trim()),
      })),
    },
    dashboard: {
      widgets: wire.dashboard.widgets.map((widget) => ({
        ...widget,
        key: lowerCamelKey(widget.key),
        size: present(widget.size),
        groupBy: widget.groupBy
          ? {
              path: widget.groupBy.path,
              field: widget.groupBy.field,
              ...(widget.groupBy.dateInterval ? { dateInterval: widget.groupBy.dateInterval } : {}),
            }
          : null,
        filters: widget.filters.map((filter) =>
          filter.operator === "in" || filter.operator === "notIn"
            ? { operator: filter.operator, field: filter.field, options: filter.options }
            : filter.operator === "inLastDays" || filter.operator === "notInLastDays"
              ? { operator: filter.operator, field: filter.field, days: Math.round(filter.days ?? 30) }
              : { operator: filter.operator, field: filter.field },
        ),
      })),
    },
    knowledgeBase: {
      pages: wire.knowledgeBase.pages.map((page) => ({
        ...page,
        key: lowerCamelKey(page.key),
        sections: page.sections.slice(0, SETUP_PLAN_LIMITS.pageSections),
      })),
    },
    importMapping: wire.importMapping,
  };
  const parsed = SetupPlanSchema.safeParse(input);
  if (parsed.success) return { ok: true, plan: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.slice(0, 30).map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  };
}

export const MappingWireSchema = z.object({
  columns: z.array(
    z.object({
      column: z.string(),
      field: z.string().nullable().describe("The offered field key, or null to leave the column out."),
      dateOrder: z.enum(["dmy", "mdy", "ymd"]).nullable(),
      currency: z.string().nullable(),
      namePart: z
        .enum(["first", "last"])
        .nullable()
        .describe("For a column of full person names: the part this field takes. Otherwise null."),
    }),
  ),
  relationships: z.array(z.object({ column: z.string(), relationship: z.string() })),
  phoneCountryCode: z.string().nullable(),
});
export type MappingWire = z.infer<typeof MappingWireSchema>;

export function sampleRecordsWireSchema(columns: readonly string[]) {
  return z.object({
    records: z.array(
      z.object(
        Object.fromEntries(columns.map((column) => [column, z.string().describe("An empty string leaves it empty.")])),
      ),
    ),
  });
}
