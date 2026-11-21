import type { LucideIcon } from "lucide-react";
import type { useTranslations } from "next-intl";
import type { AutomationCanvasStep, AutomationRunMark } from "@/components/automations/canvas/automation-canvas-types";
import type { AutomationBuilderModel } from "./automation-builder-model";
import type { AutomationDraft, DraftEffect } from "./automation-draft";

import { Bell, Filter, ListPlus, Pencil, Webhook, Zap } from "lucide-react";

import { AutomationAgentIcon } from "@/components/automations/automation-agent-icon";

import { conditionSentence, effectSentence, triggerSentence } from "./automation-draft-sentence";

type Translate = ReturnType<typeof useTranslations>;

type EffectKind = Exclude<DraftEffect["kind"], "kept">;

const EFFECT_ICONS: Record<EffectKind, LucideIcon> = {
  setField: Pencil,
  createRecord: ListPlus,
  notify: Bell,
  callWebhook: Webhook,
  agent: AutomationAgentIcon,
};

export function effectKindOf(effect: DraftEffect): EffectKind {
  return effect.kind === "kept" ? effect.effect.kind : effect.kind;
}

function effectLabel(kind: EffectKind, t: Translate): string {
  switch (kind) {
    case "setField":
      return t("AutomationRules.effect.setField");
    case "createRecord":
      return t("AutomationRules.effect.createRecord");
    case "notify":
      return t("AutomationRules.effect.notify");
    case "callWebhook":
      return t("AutomationRules.effect.callWebhook");
    case "agent":
      return t("Automations.canvas.agentStep");
  }
}

export function agentRuntimeLabel(runtime: string, t: Translate): string {
  if (runtime === "ownKey") return t("Automations.canvas.runtime.ownKey");
  return runtime === "runner" ? t("Automations.canvas.runtime.runner") : t("Automations.canvas.runtime.mate");
}

function agentBadge(effect: DraftEffect, t: Translate): string | undefined {
  const agent = effect.kind === "agent" ? effect : effect.kind === "kept" ? effect.effect : null;
  const runtime = agent?.kind === "agent" ? agent.runtime : null;
  if (!runtime) return undefined;
  if (runtime === "ownKey") return t("Automations.runsOn.ownKey");
  return runtime === "runner" ? t("Automations.runsOn.runner") : t("Automations.runsOn.mate");
}

export type RuleCanvasInput = {
  draft: AutomationDraft;
  model: AutomationBuilderModel;
  placeholder: boolean;
  canAddCondition: boolean;
  canAddEffect: boolean;
  invalid: (card: string) => boolean;
  marks: Readonly<Record<string, AutomationRunMark>> | null;
  t: Translate;
};

export function ruleCanvasSteps({
  draft,
  model,
  placeholder,
  canAddCondition,
  canAddEffect,
  invalid,
  marks,
  t,
}: RuleCanvasInput): AutomationCanvasStep[] {
  const trigger: AutomationCanvasStep = placeholder
    ? {
        id: "trigger",
        tone: "empty",
        icon: Zap,
        label: t("Automations.builder.when"),
        sentence: t("Automations.canvas.placeholder"),
        fixed: true,
        invalid: invalid("trigger"),
      }
    : {
        id: "trigger",
        tone: "trigger",
        icon: Zap,
        label: t("Automations.builder.when"),
        sentence: triggerSentence(draft.trigger, model, t),
        fixed: true,
        invalid: invalid("trigger"),
        mark: marks?.trigger ?? null,
      };
  if (placeholder) return [trigger];

  const conditionCount = draft.conditions.length;
  const conditions = draft.conditions.map(
    (condition, index): AutomationCanvasStep => ({
      id: `condition-${index}`,
      tone: "condition",
      icon: Filter,
      label: t("Automations.builder.if"),
      sentence: conditionSentence(condition, draft.trigger, model, t),
      invalid: invalid(`conditions.${index}`),
      canMoveUp: index > 0,
      canMoveDown: index < conditionCount - 1,
      canDuplicate: canAddCondition,
      mark: marks?.[`condition-${index}`] ?? null,
    }),
  );
  const effectCount = draft.effects.length;
  const effects = draft.effects.map((effect, index): AutomationCanvasStep => {
    const kind = effectKindOf(effect);
    return {
      id: `effect-${index}`,
      tone: kind === "agent" ? "agent" : "action",
      icon: EFFECT_ICONS[kind],
      label: effectLabel(kind, t),
      sentence: effectSentence(effect, model, draft.trigger, t),
      badge: agentBadge(effect, t),
      invalid: invalid(`effects.${index}`),
      canMoveUp: index > 0,
      canMoveDown: index < effectCount - 1,
      canDuplicate: canAddEffect,
      mark: marks?.[`effect-${index}`] ?? null,
    };
  });
  return [trigger, ...conditions, ...effects];
}
