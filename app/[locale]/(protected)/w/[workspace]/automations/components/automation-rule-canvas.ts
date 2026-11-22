import type { useTranslations } from "next-intl";
import type { AutomationPaletteReasons } from "@/components/automations/automation-palette";
import type {
  AutomationCanvasActions,
  AutomationCanvasStep,
} from "@/components/automations/canvas/automation-canvas-types";
import type { AutomationBuilderStore } from "./automation-builder.store";
import type { RuleRunReplay } from "./automation-rule-replay";

import { ruleCanvasSteps } from "./automation-canvas-steps";
import { draftHasRecord } from "./automation-draft";
import { paletteAvailability } from "./automation-palette-availability";
import { ruleRunReplay } from "./automation-rule-replay";

type Translate = ReturnType<typeof useTranslations>;

export type RuleCanvasView = {
  steps: AutomationCanvasStep[];
  actions: AutomationCanvasActions;
  replay: RuleRunReplay | null;
};

export function ruleCanvasView(store: AutomationBuilderStore, t: Translate): RuleCanvasView | null {
  const { form, model, context } = store;
  if (!model || !context) return null;
  const readOnly = store.isReadOnly;
  const replay = store.replay ? ruleRunReplay(store.replay, form) : null;
  const steps = ruleCanvasSteps({
    draft: form,
    model,
    canAddCondition: store.canAddCondition,
    canAddEffect: store.canAddEffect,
    invalid: (card) => store.isFlagged(card) || store.unavailableAt(card) !== undefined,
    marks: replay?.marks ?? null,
    t,
  });
  const { disabled, restricted } = paletteAvailability({
    hasRecord: draftHasRecord(form.trigger),
    canAddCondition: store.canAddCondition,
    canAddEffect: store.canAddEffect,
    webhooksVisible: context.webhooks !== null,
  });
  const reasons: AutomationPaletteReasons = restricted.includes("callWebhook")
    ? { callWebhook: t("Automations.palette.callWebhook.restricted") }
    : {};
  const editable = !readOnly && !store.replay;
  const actions: AutomationCanvasActions = {
    selected: store.expanded,
    paletteAt: store.palette?.index ?? null,
    palette: editable ? { disabled, reasons } : null,
    editable,
    onSelect: store.select,
    onOpenPalette: (index) => (index === null ? store.closePalette() : store.openPalette({ index })),
    onPick: store.insertStep,
    onMove: store.moveStep,
    onDuplicate: store.duplicateStep,
    onRemove: store.removeStep,
  };
  return { steps, actions, replay };
}
