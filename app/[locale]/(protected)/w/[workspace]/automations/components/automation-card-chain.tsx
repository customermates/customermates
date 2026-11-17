"use client";

import type { LucideIcon } from "lucide-react";
import type { AutomationPaletteKind, AutomationPaletteReasons } from "@/components/automations/automation-palette";
import type { AutomationBuilderStore } from "./automation-builder.store";
import type { ChainFocus } from "./automation-chain-focus";

import { Bell, Filter, ListPlus, Pencil, Sparkles, Webhook, Zap } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { AutomationCard, AutomationConnector } from "@/components/automations/automation-card";
import { AutomationPalette } from "@/components/automations/automation-palette";

import { focusAfterRemoval } from "./automation-chain-focus";
import { AutomationConditionFields } from "./automation-condition-fields";
import { conditionSentence, effectSentence, triggerSentence } from "./automation-draft-sentence";
import { AutomationEffectFields } from "./automation-effect-fields";
import { paletteAvailability } from "./automation-palette-availability";
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
  const chainRef = useRef<HTMLDivElement>(null);
  const focusAfterRender = useRef<ChainFocus | null>(null);
  const { form, model, context, palette } = store;

  useEffect(() => {
    const target = focusAfterRender.current;
    const chain = chainRef.current;
    if (!target || !chain) return;
    focusAfterRender.current = null;
    const element =
      "card" in target
        ? chain.querySelector<HTMLElement>(`[data-automation-card="${target.card}"] button[aria-expanded]`)
        : chain.querySelectorAll<HTMLElement>("[data-automation-connector] button")[target.connector];
    element?.focus();
  });

  if (!model || !context) return null;

  const hasRecord = draftHasRecord(form.trigger);
  const conditionCount = form.conditions.length;
  const { disabled, restricted } = paletteAvailability({
    hasRecord,
    canAddCondition: store.canAddCondition,
    canAddEffect: store.canAddEffect,
    webhooksVisible: context.webhooks !== null,
  });
  const reasons: AutomationPaletteReasons = restricted.includes("callWebhook")
    ? { callWebhook: t("Automations.palette.callWebhook.restricted") }
    : {};

  const pick = (kind: AutomationPaletteKind, position: number) => {
    if (kind === "condition") {
      const at = Math.min(position, conditionCount);
      focusAfterRender.current = { card: `condition-${at}` };
      store.addCondition(at);
    } else {
      const at = Math.max(0, position - conditionCount);
      focusAfterRender.current = { card: `effect-${at}` };
      store.addEffect(kind, at);
    }
  };

  const remove = (group: "condition" | "effect", index: number) => {
    focusAfterRender.current = focusAfterRemoval(group, index, {
      conditions: conditionCount,
      effects: form.effects.length,
    });
    if (group === "condition") store.removeCondition(index);
    else store.removeEffect(index);
  };

  const dismissPalette = (position: number) => {
    focusAfterRender.current = { connector: position };
    store.closePalette();
  };

  const readOnly = store.isReadOnly;

  const slot = (position: number) =>
    readOnly ? (
      <AutomationConnector active={false} label={t("Automations.builder.addStep")} />
    ) : (
      <>
        <AutomationConnector
          active={palette?.index === position}
          label={t("Automations.builder.addStep")}
          onAdd={() => (palette?.index === position ? store.closePalette() : store.openPalette({ index: position }))}
        />

        {palette?.index === position && (
          <AutomationPalette
            disabled={disabled}
            reasons={reasons}
            onClose={() => dismissPalette(position)}
            onPick={(kind) => pick(kind, position)}
          />
        )}
      </>
    );

  return (
    <div ref={chainRef} className="flex flex-col" data-automation-chain="">
      <AutomationCard
        cardId="trigger"
        expanded={store.expanded === "trigger"}
        icon={Zap}
        invalid={store.isFlagged("trigger") || store.unavailableAt("trigger") !== undefined}
        kindLabel={t("Automations.builder.when")}
        openHint={readOnly ? undefined : t("AutomationRules.edit")}
        readOnly={readOnly}
        sentence={triggerSentence(form.trigger, model, t)}
        onToggle={() => store.toggleCard("trigger")}
      >
        <AutomationTriggerEditor
          flagged={store.isFlagged}
          model={model}
          trigger={form.trigger}
          unavailable={store.unavailableAt("trigger")}
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
            invalid={store.isFlagged(`conditions.${index}`) || store.unavailableAt(`conditions.${index}`) !== undefined}
            kindLabel={t("Automations.builder.if")}
            openHint={readOnly ? undefined : t("AutomationRules.edit")}
            readOnly={readOnly}
            removeLabel={t("Automations.builder.removeStep")}
            sentence={conditionSentence(condition, form.trigger, model, t)}
            onRemove={() => remove("condition", index)}
            onToggle={() => store.toggleCard(`condition-${index}`)}
          >
            <AutomationConditionFields
              condition={condition}
              flagged={store.isFlagged(`conditions.${index}`)}
              model={model}
              typeId={form.trigger.typeId}
              unavailable={store.unavailableAt(`conditions.${index}`)}
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
            invalid={store.isFlagged(`effects.${index}`) || store.unavailableAt(`effects.${index}`) !== undefined}
            kindLabel={t("Automations.builder.then")}
            openHint={readOnly ? undefined : t("AutomationRules.edit")}
            readOnly={readOnly}
            removeLabel={t("Automations.builder.removeStep")}
            sentence={effectSentence(effect, model, form.trigger, t)}
            onRemove={() => remove("effect", index)}
            onToggle={() => store.toggleCard(`effect-${index}`)}
          >
            <AutomationEffectFields
              canOpenAgentSettings={store.canOpenAgentSettings}
              effect={effect}
              flagged={store.isFlagged(`effects.${index}`)}
              model={model}
              ownRule={store.isOwner}
              runtimes={context.runtimes}
              trigger={form.trigger}
              unavailable={store.unavailableAt(`effects.${index}`)}
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
