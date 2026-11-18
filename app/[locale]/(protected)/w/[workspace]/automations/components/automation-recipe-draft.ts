import type { AgentRuntimeKind } from "@/features/automation-rules/automation-rule.schema";
import type { AutomationRecipe, RecipeEffect } from "@/features/automation-rules/recipes";
import type { RecipeText } from "@/components/automations/automation-recipe-text";
import type { AutomationBuilderList, AutomationBuilderModel } from "./automation-builder-model";
import type { AutomationDraft, DraftCondition, DraftEffect, DraftTrigger } from "./automation-draft";

import { blankAgentEffect, blankCondition, blankEffect, emptyDraft } from "./automation-draft";

const DATE_TYPES = new Set(["date", "dateTime"]);

export type RecipeBindings = { typeId: string; stageFieldId: string; dateFieldId: string; reasonFieldId: string };

function only<T>(items: T[]): T | undefined {
  return items.length === 1 ? items[0] : undefined;
}

function stageFields(list: AutomationBuilderList | undefined) {
  return (list?.fields ?? []).filter((field) => field.valueType === "select" && !field.multiple);
}

function dateFields(list: AutomationBuilderList | undefined) {
  return (list?.fields ?? []).filter((field) => DATE_TYPES.has(field.valueType));
}

function reasonFields(list: AutomationBuilderList | undefined) {
  return (list?.fields ?? []).filter((field) => field.writable && field.valueType === "text");
}

function qualifies(recipe: AutomationRecipe, list: AutomationBuilderList): boolean {
  if (recipe.slots.includes("stageField") && stageFields(list).length === 0) return false;
  if (recipe.slots.includes("dateField") && dateFields(list).length === 0) return false;
  return true;
}

export function bindRecipe(recipe: AutomationRecipe, model: AutomationBuilderModel): RecipeBindings {
  const unresolved: RecipeBindings = { typeId: "", stageFieldId: "", dateFieldId: "", reasonFieldId: "" };
  if (!recipe.slots.includes("list")) return unresolved;
  const list = only(model.lists.filter((candidate) => qualifies(recipe, candidate)));
  if (!list) return unresolved;
  return {
    typeId: list.id,
    stageFieldId: recipe.slots.includes("stageField") ? (only(stageFields(list))?.id ?? "") : "",
    dateFieldId: recipe.slots.includes("dateField") ? (only(dateFields(list))?.id ?? "") : "",
    reasonFieldId: recipe.slots.includes("reasonField")
      ? (only(reasonFields(list).filter((field) => field.id !== list.primaryFieldId))?.id ?? "")
      : "",
  };
}

function draftTrigger(recipe: AutomationRecipe, base: DraftTrigger, bindings: RecipeBindings): DraftTrigger {
  const { trigger } = recipe;
  const typeId = bindings.typeId;
  switch (trigger.kind) {
    case "formSubmitted":
      return { ...base, kind: "formSubmitted", typeId: "", fieldId: "", value: "" };
    case "bookingChanged":
      return { ...base, kind: "bookingChanged", change: trigger.change, typeId: "", fieldId: "", value: "" };
    case "stageChanged":
      return { ...base, kind: "fieldChanged", typeId, fieldId: bindings.stageFieldId, value: "" };
    case "stageUpdated":
      return {
        ...base,
        kind: "recordUpdated",
        typeId,
        fieldId: "",
        fieldIds: bindings.stageFieldId ? [bindings.stageFieldId] : [],
        value: "",
      };
    case "dateReached":
      return {
        ...base,
        kind: "dateReached",
        typeId,
        fieldId: bindings.dateFieldId,
        value: "",
        days: String(trigger.days),
        direction: trigger.direction,
        atHour: String(trigger.atHour),
      };
    default:
      return base;
  }
}

function draftEffect(
  effect: RecipeEffect,
  texts: string[],
  model: AutomationBuilderModel,
  typeId: string,
  runtime: AgentRuntimeKind,
): DraftEffect {
  const text = texts[effect.text] ?? "";
  if (effect.kind === "agent") return { ...blankAgentEffect(runtime), prompt: text };
  if (effect.kind === "notify") {
    return {
      kind: "notify",
      toOwner: true,
      toAssignees: false,
      notificationKind: effect.notificationKind,
      title: text,
      body: "",
    };
  }
  const blank = blankEffect("createRecord", model, typeId);
  if (blank.kind !== "createRecord") return blank;
  const target = model.lists.find((list) => list.id === blank.typeId);
  const due = only(dateFields(target).filter((field) => field.writable));
  return {
    ...blank,
    title: text,
    dueFieldId: due?.id ?? "",
    dueDays: due ? String(effect.dueDays) : "",
  };
}

export function recipeToDraft(
  recipe: AutomationRecipe,
  model: AutomationBuilderModel,
  options: { timezone: string; text: RecipeText; runtime: AgentRuntimeKind },
): AutomationDraft {
  const bindings = bindRecipe(recipe, model);
  const base = emptyDraft(model, { typeId: bindings.typeId || undefined, timezone: options.timezone });
  const conditions: DraftCondition[] = recipe.conditions.map(() => blankCondition(bindings.reasonFieldId, "empty"));
  return {
    ...base,
    name: options.text.title,
    trigger: draftTrigger(recipe, base.trigger, bindings),
    conditions,
    effects: recipe.effects.map((effect) =>
      draftEffect(effect, options.text.effects, model, bindings.typeId, options.runtime),
    ),
  };
}
