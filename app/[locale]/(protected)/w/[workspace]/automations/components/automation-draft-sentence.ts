import type { useTranslations } from "next-intl";
import type { RoutineDto } from "@/ee/routines/routine.schema";
import type { AutomationCondition } from "@/features/automation-rules/automation-rule.schema";
import type { AutomationBuilderField, AutomationBuilderModel } from "./automation-builder-model";
import type { AutomationDraft, DraftCondition, DraftEffect, DraftTrigger, DraftUnavailable } from "./automation-draft";

import { describeRoutineSchedule } from "@/ee/routines/routine-schedule-preset";
import { eventLabel } from "@/features/event/event-label";

import { fieldOfList, listOf } from "./automation-draft";

type Translate = ReturnType<typeof useTranslations>;

const PROMPT_PREVIEW_CHARS = 80;

export function truncatePrompt(prompt: string): string {
  const text = prompt.replace(/\s+/g, " ").trim();
  return text.length > PROMPT_PREVIEW_CHARS ? `${text.slice(0, PROMPT_PREVIEW_CHARS - 1).trimEnd()}…` : text;
}

export function joinSentenceParts(parts: string[], locale: string): string {
  try {
    return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(parts);
  } catch {
    return parts.join(", ");
  }
}

export function triggerSentence(trigger: DraftTrigger, model: AutomationBuilderModel, t: Translate): string {
  const list = listOf(model, trigger.typeId)?.label ?? t("Automations.sentence.aList");
  const field = fieldOfList(model, trigger.typeId, trigger.fieldId)?.label ?? t("Automations.sentence.aField");
  switch (trigger.kind) {
    case "recordCreated":
      return t("AutomationRules.summary.recordCreated", { list });
    case "recordUpdated":
      return t("AutomationRules.summary.recordUpdated", { list });
    case "fieldChanged":
      return t("AutomationRules.summary.fieldChanged", { list, field });
    case "dateReached":
      return t("AutomationRules.summary.dateReached", {
        list,
        field,
        days: Number(trigger.days) || 0,
        direction: trigger.direction,
      });
    case "messageReceived":
      return t("AutomationRules.summary.messageReceived");
    case "formSubmitted":
      return t("AutomationRules.summary.formSubmitted");
    case "webhookReceived":
      return t("AutomationRules.summary.webhookReceived");
    default:
      return t("Automations.sentence.otherTrigger");
  }
}

function optionLabel(field: AutomationBuilderField | undefined, id: string): string {
  return field?.options.find((item) => item.id === id)?.label ?? id;
}

function scalarLabel(scalar: unknown, field: AutomationBuilderField | undefined, t: Translate): string {
  if (!scalar || typeof scalar !== "object" || !("kind" in scalar) || !("value" in scalar)) return "";
  const { kind, value } = scalar;
  if (kind === "boolean")
    return value === true ? t("AutomationRules.builder.boolean.true") : t("AutomationRules.builder.boolean.false");
  if (Array.isArray(value)) {
    return kind === "selectList" || kind === "textList"
      ? value.map((item) => optionLabel(field, String(item))).join(", ")
      : "";
  }
  if (typeof value !== "string" || kind === "member") return "";
  if (kind === "select") return optionLabel(field, value);
  return kind === "date" ? value.slice(0, 10) : value;
}

function keptConditionParts(kept: AutomationCondition, field: AutomationBuilderField | undefined, t: Translate) {
  if (kept.operator === "in" || kept.operator === "notIn") {
    return [
      kept.operator === "in" ? t("AutomationRules.operator.in") : t("AutomationRules.operator.notIn"),
      (kept.values ?? []).map((value) => scalarLabel(value, field, t)).join(", "),
    ];
  }
  if (kept.operator === "empty") return [t("AutomationRules.operator.empty")];
  if (kept.operator === "notEmpty") return [t("AutomationRules.operator.notEmpty")];
  if (kept.operator === "equals") return [t("AutomationRules.operator.equals"), scalarLabel(kept.value, field, t)];
  if (kept.operator === "notEquals")
    return [t("AutomationRules.operator.notEquals"), scalarLabel(kept.value, field, t)];
  if (kept.value) {
    return [
      kept.operator === "before" ? t("AutomationRules.operator.beforeDate") : t("AutomationRules.operator.afterDate"),
      scalarLabel(kept.value, field, t),
    ];
  }
  return [
    kept.operator === "before" ? t("AutomationRules.operator.before") : t("AutomationRules.operator.after"),
    String(kept.relativeDays ?? 0),
  ];
}

function conditionParts(condition: DraftCondition, field: AutomationBuilderField | undefined, t: Translate) {
  if (condition.kept) return keptConditionParts(condition.kept, field, t);
  if (condition.operator === "in" || condition.operator === "notIn") {
    return [
      condition.operator === "in" ? t("AutomationRules.operator.in") : t("AutomationRules.operator.notIn"),
      condition.values.map((value) => optionLabel(field, value)).join(", "),
    ];
  }
  const needsValue = condition.operator !== "empty" && condition.operator !== "notEmpty";
  return [t(`AutomationRules.operator.${condition.operator}`), needsValue ? optionLabel(field, condition.value) : ""];
}

export function conditionSentence(
  condition: DraftCondition,
  trigger: DraftTrigger,
  model: AutomationBuilderModel,
  t: Translate,
): string {
  const field = fieldOfList(model, trigger.typeId, condition.kept?.fieldId ?? condition.fieldId);
  const parts = [field?.label ?? t("Automations.sentence.aField"), ...conditionParts(condition, field, t)];
  return t("Automations.sentence.if", { condition: parts.filter(Boolean).join(" ") });
}

export function effectSentence(
  effect: DraftEffect,
  model: AutomationBuilderModel,
  trigger: DraftTrigger,
  t: Translate,
): string {
  switch (effect.kind) {
    case "setField":
      return t("Automations.sentence.effect.setField", {
        field: fieldOfList(model, trigger.typeId, effect.fieldId)?.label ?? t("Automations.sentence.aField"),
      });
    case "createRecord":
      return t("Automations.sentence.effect.createRecord", {
        list: listOf(model, effect.typeId)?.label ?? t("Automations.sentence.aList"),
      });
    case "notify":
      if (effect.toOwner && effect.toAssignees) return t("Automations.sentence.effect.notifyBoth");
      return effect.toAssignees
        ? t("Automations.sentence.effect.notifyAssignees")
        : t("Automations.sentence.effect.notifyOwner");
    case "callWebhook":
      return t("Automations.sentence.effect.callWebhook");
    case "agent":
      return t("Automations.sentence.effect.agent", {
        prompt: truncatePrompt(effect.prompt) || t("Automations.sentence.somethingForYou"),
      });
    default:
      return t("Automations.sentence.effect.kept");
  }
}

export function unavailableMessage(
  draft: AutomationDraft,
  entry: DraftUnavailable | undefined,
  model: AutomationBuilderModel,
  t: Translate,
): string {
  if (!entry) return t("AutomationRules.builder.incomplete");
  if (entry.card === "trigger") return t("Automations.unavailable.blockedTrigger");
  const [group, position] = entry.card.split(".");
  const index = Number(position);
  const condition = group === "conditions" ? draft.conditions[index] : undefined;
  const effect = group === "effects" ? draft.effects[index] : undefined;
  const step = condition
    ? conditionSentence(condition, draft.trigger, model, t)
    : effect
      ? effectSentence(effect, model, draft.trigger, t)
      : "";
  return t("Automations.unavailable.blockedStep", { step });
}

export function draftSentence(draft: AutomationDraft, model: AutomationBuilderModel, t: Translate, locale: string) {
  const conditions = draft.conditions.map((condition) => conditionSentence(condition, draft.trigger, model, t));
  const effects = joinSentenceParts(
    draft.effects.map((effect) => effectSentence(effect, model, draft.trigger, t)),
    locale,
  );
  return [triggerSentence(draft.trigger, model, t), ...conditions, effects].filter(Boolean).join(", ");
}

export function routineSentence(routine: RoutineDto, t: Translate, formatTime: (date: Date) => string): string {
  const prompt = truncatePrompt(routine.prompt);
  if (routine.triggerKind === "schedule") {
    return t("Automations.sentence.routineSchedule", {
      schedule: describeRoutineSchedule(routine.cronExpression, t, formatTime),
      prompt,
    });
  }
  const first = routine.triggerEvents[0];
  return t("Automations.sentence.routineEvent", { event: first ? eventLabel(t, first) : "", prompt });
}
