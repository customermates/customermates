import type { useTranslations } from "next-intl";
import type { RoutineDto } from "@/ee/routines/routine.schema";
import type { AutomationBuilderModel } from "./automation-builder-model";
import type { AutomationDraft, DraftCondition, DraftEffect, DraftTrigger } from "./automation-draft";

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

export function conditionSentence(
  condition: DraftCondition,
  trigger: DraftTrigger,
  model: AutomationBuilderModel,
  t: Translate,
): string {
  const field = fieldOfList(model, trigger.typeId, condition.fieldId);
  const option = field?.options.find((item) => item.id === condition.value)?.label;
  const needsValue = condition.operator !== "empty" && condition.operator !== "notEmpty";
  const parts = [
    field?.label ?? t("Automations.sentence.aField"),
    t(`AutomationRules.operator.${condition.operator}`),
    needsValue ? (option ?? condition.value) : "",
  ].filter(Boolean);
  return t("Automations.sentence.if", { condition: parts.join(" ") });
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
