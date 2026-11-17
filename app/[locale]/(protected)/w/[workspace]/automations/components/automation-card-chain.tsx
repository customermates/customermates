"use client";

import type { LucideIcon } from "lucide-react";
import type { AutomationPaletteKind } from "@/components/automations/automation-palette";
import type { AutomationBuilderStore } from "./automation-builder.store";

import { Bell, Filter, ListPlus, Pencil, Sparkles, Webhook, Zap } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AutomationCard, AutomationConnector } from "@/components/automations/automation-card";
import { AutomationPalette } from "@/components/automations/automation-palette";

import { AutomationConditionFields } from "./automation-condition-fields";
import { conditionSentence, effectSentence, triggerSentence } from "./automation-draft-sentence";
import { AutomationEffectFields } from "./automation-effect-fields";
import { AutomationTriggerEditor } from "./automation-trigger-editor";
import { draftHasRecord } from "./automation-draft";

const EFFECT_ICONS: Record<string, LucideIcon> = {
  setField: Pencil,
  createRecord: ListPlus,
  notify: Bell,
  callWebhook: Webhook,
  agent: Sparkles,
  kept: Zap,
};

export const AutomationCardChain = observer(function AutomationCardChain({ store }: { store: AutomationBuilderStore }) {
  const t = useTranslations();
  const { form, model, context, palette } = store;
  if (!model || !context) return null;

  const hasRecord = draftHasRecord(form.trigger);
  const conditionCount = form.conditions.length;
  const disabled = new Set<AutomationPaletteKind>();
  if (!hasRecord || !store.canAddCondition) disabled.add("condition");
  if (!hasRecord) disabled.add("setField");
  if (!store.canAddEffect)
    for (const kind of ["setField", "createRecord", "notify", "callWebhook", "agent"] as const) disabled.add(kind);

  const pick = (kind: AutomationPaletteKind, position: number) => {
    if (kind === "condition") store.addCondition(Math.min(position, conditionCount));
    else store.addEffect(kind, Math.max(0, position - conditionCount));
  };

  const slot = (position: number) => (
    <>
      <AutomationConnector
        active={palette?.index === position}
        label={t("Automations.builder.addStep")}
        onAdd={() => (palette?.index === position ? store.closePalette() : store.openPalette({ index: position }))}
      />

      {palette?.index === position && (
        <AutomationPalette disabled={disabled} onClose={store.closePalette} onPick={(kind) => pick(kind, position)} />
      )}
    </>
  );

  return (
    <div className="flex flex-col" data-automation-chain="">
      <AutomationCard
        cardId="trigger"
        expanded={store.expanded === "trigger"}
        icon={Zap}
        invalid={store.isFlagged("trigger")}
        kindLabel={t("Automations.builder.when")}
        sentence={triggerSentence(form.trigger, model, t)}
        onToggle={() => store.toggleCard("trigger")}
      >
        <AutomationTriggerEditor
          flagged={store.isFlagged}
          model={model}
          trigger={form.trigger}
          onChange={store.patchTrigger}
        />
      </AutomationCard>

      {form.conditions.map((condition, index) => (
        <div key={`condition-${index}`} className="flex flex-col">
          {slot(index)}

          <AutomationCard
            cardId={`condition-${index}`}
            expanded={store.expanded === `condition-${index}`}
            icon={Filter}
            invalid={store.isFlagged(`conditions.${index}`)}
            kindLabel={t("Automations.builder.if")}
            removeLabel={t("Automations.builder.removeStep")}
            sentence={conditionSentence(condition, form.trigger, model, t)}
            onRemove={() => store.removeCondition(index)}
            onToggle={() => store.toggleCard(`condition-${index}`)}
          >
            <AutomationConditionFields
              condition={condition}
              flagged={store.isFlagged(`conditions.${index}`)}
              model={model}
              typeId={form.trigger.typeId}
              onChange={(patch) => store.patchCondition(index, patch)}
            />
          </AutomationCard>
        </div>
      ))}

      {form.effects.map((effect, index) => (
        <div key={`effect-${index}`} className="flex flex-col">
          {slot(conditionCount + index)}

          <AutomationCard
            cardId={`effect-${index}`}
            expanded={store.expanded === `effect-${index}`}
            icon={EFFECT_ICONS[effect.kind] ?? Zap}
            invalid={store.isFlagged(`effects.${index}`)}
            kindLabel={t("Automations.builder.then")}
            removeLabel={t("Automations.builder.removeStep")}
            sentence={effectSentence(effect, model, form.trigger, t)}
            onRemove={() => store.removeEffect(index)}
            onToggle={() => store.toggleCard(`effect-${index}`)}
          >
            <AutomationEffectFields
              effect={effect}
              flagged={store.isFlagged(`effects.${index}`)}
              model={model}
              runtimes={context.runtimes}
              trigger={form.trigger}
              webhooks={context.webhooks}
              onChange={(next) => store.setEffect(index, next)}
            />
          </AutomationCard>
        </div>
      ))}

      {slot(conditionCount + form.effects.length)}

      {form.effects.length === 0 && store.isFlagged("effects") && (
        <p className="text-xs text-destructive" role="alert">
          {t("Automations.builder.needsStep")}
        </p>
      )}
    </div>
  );
});
