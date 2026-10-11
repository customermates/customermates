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
  SetupFieldKeySchema,
  SetupPlanSchema,
} from "@/features/workspace-setup/setup-plan.schema";
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
    const value = wireAnswerValue(part.format, entry);
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
  key: z.string(),
  label: z.string(),
  color: z.enum(CHIP_COLORS).nullable(),
  weight: z.number().nullable(),
  outcome: z.enum(["open", "won", "lost"]).nullable(),
});
const FieldRefDescription =
  "A field reference such as deal.stage, or system:createdAt, system:updatedAt, system:assignedTo.";

export const PlanWireSchema = z.object({
  workspace: z.object({
    currency: z.string().describe("ISO 4217 code."),
    dashboardAudience: z.enum(["me", "team", "management"]),
  }),
  recordModel: z.object({
    lists: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        pluralLabel: z.string(),
        description: z.string(),
        icon: z.string().describe("A lucide icon name in lowerCamelCase, such as kanban or fileText."),
        color: z.enum(CHIP_COLORS).nullable(),
      }),
    ),
    listChanges: z.array(
      z.object({
        list: z.string(),
        label: z.string().nullable(),
        pluralLabel: z.string().nullable(),
        icon: z.string().nullable(),
        color: z.enum(CHIP_COLORS).nullable(),
      }),
    ),
    fields: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        valueType: z.enum(SETUP_FIELD_VALUE_TYPES),
        required: z.boolean(),
        multiple: z.boolean(),
        options: z.array(WireOptionSchema),
      }),
    ),
    fieldChanges: z.array(
      z.object({ field: z.string(), label: z.string().nullable(), options: z.array(WireOptionSchema).nullable() }),
    ),
    relationships: z.array(
      z.object({
        key: z.string(),
        source: z.string(),
        target: z.string(),
        sourceLabel: z.string().describe("How a source record names its linked target."),
        targetLabel: z.string().describe("How a target record names its linked sources."),
        sourceCardinality: z.enum(["one", "many"]),
        targetCardinality: z.enum(["one", "many"]),
      }),
    ),
    calculations: z.array(
      z.object({
        key: z.string(),
        label: z.string(),
        valueType: z.enum(["number", "currency", "date", "boolean", "text"]),
        expression: z.string().describe("The expression tree as a JSON string."),
      }),
    ),
  }),
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
  sampleData: z.object({
    lists: z.array(z.object({ list: z.string(), count: z.number(), kinds: z.array(z.string()) })),
  }),
  dashboard: z.object({
    widgets: z.array(
      z.object({
        key: z.string(),
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
  }),
  knowledgeBase: z.object({
    pages: z.array(
      z.object({ key: z.string(), kind: z.enum(SETUP_PAGE_KINDS), title: z.string(), sections: z.array(z.string()) }),
    ),
  }),
  importMapping: z
    .object({ list: z.string(), columns: z.array(z.object({ column: z.string(), field: z.string().nullable() })) })
    .nullable(),
});
export type PlanWire = z.infer<typeof PlanWireSchema>;

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

function expression(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export function planFromWire(
  wire: PlanWire,
): { ok: true; plan: SetupPlan } | { ok: false; issues: Array<{ path: string; message: string }> } {
  const model = wire.recordModel;
  const input = {
    version: 1,
    workspace: wire.workspace,
    recordModel: {
      lists: model.lists.map((list) => ({ ...list, color: present(list.color) })),
      listChanges: model.listChanges.map((change) => ({
        list: change.list,
        label: present(change.label),
        pluralLabel: present(change.pluralLabel),
        icon: present(change.icon),
        color: present(change.color),
      })),
      fields: model.fields.map((field) => ({ ...field, options: field.options.map(option) })),
      fieldChanges: model.fieldChanges.map((change) => ({
        field: change.field,
        label: present(change.label),
        options: change.options === null ? undefined : change.options.map(option),
      })),
      relationships: model.relationships,
      calculations: model.calculations.map((calculation) => ({
        ...calculation,
        expression: expression(calculation.expression),
      })),
    },
    listDefaults: wire.listDefaults.map((value) => ({
      ...value,
      columns: value.columns.filter((column) => SetupFieldKeySchema.safeParse(column).success),
    })),
    sampleData: {
      lists: wire.sampleData.lists.map((list) => ({ ...list, count: Math.round(list.count) })),
    },
    dashboard: {
      widgets: wire.dashboard.widgets.map((widget) => ({
        ...widget,
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
    knowledgeBase: wire.knowledgeBase,
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
    }),
  ),
  relationships: z.array(z.object({ column: z.string(), relationship: z.string() })),
  phoneCountryCode: z.string().nullable(),
});
export type MappingWire = z.infer<typeof MappingWireSchema>;

export function sampleRecordsWireSchema(columns: readonly string[]) {
  return z.object({
    records: z.array(z.object(Object.fromEntries(columns.map((column) => [column, z.string().nullable()])))),
  });
}
