"use client";

import { useTranslations } from "next-intl";

import type { AgentRuntimeAvailability } from "@/features/automation-rules/agent-runtime-availability";
import type { AutomationBuilderModel } from "./automation-builder-model";
import type { DraftEffect, DraftTrigger } from "./automation-draft";

import { draftHasRecord, listOf } from "./automation-draft";
import { AutomationAgentFields } from "./automation-agent-fields";
import { Choose, Labeled } from "./automation-builder-fields";
import { CreateRecordEditor, NotifyEditor, SetFieldEditor } from "./automation-effect-editors";

type Props = {
  effect: DraftEffect;
  trigger: DraftTrigger;
  model: AutomationBuilderModel;
  runtimes: AgentRuntimeAvailability;
  webhooks: { id: string; label: string }[];
  flagged: boolean;
  onChange: (effect: DraftEffect) => void;
};

export function AutomationEffectFields({ effect, trigger, model, runtimes, webhooks, flagged, onChange }: Props) {
  const t = useTranslations();
  const hasRecord = draftHasRecord(trigger);
  const triggerList = listOf(model, trigger.typeId);

  return (
    <div className="flex flex-col gap-3">
      {effect.kind === "kept" && (
        <p className="text-sm text-muted-foreground">
          {t("AutomationRules.builder.keptEffect", { kind: effect.effect.kind })}
        </p>
      )}

      {effect.kind === "notify" && <NotifyEditor effect={effect} hasRecord={hasRecord} onChange={onChange} />}

      {effect.kind === "createRecord" && (
        <CreateRecordEditor
          effect={effect}
          hasRecord={hasRecord}
          model={model}
          triggerTypeId={trigger.typeId}
          onChange={onChange}
        />
      )}

      {effect.kind === "setField" && (
        <SetFieldEditor
          effect={effect}
          fields={(triggerList?.fields ?? []).filter((field) => field.writable)}
          model={model}
          triggerTypeId={trigger.typeId}
          onChange={onChange}
        />
      )}

      {effect.kind === "callWebhook" && (
        <Labeled label={t("Automations.builder.webhook")}>
          <Choose
            items={webhooks}
            label={t("Automations.builder.webhook")}
            placeholder={t("AutomationRules.builder.choose")}
            value={effect.webhookId}
            onChange={(webhookId) => onChange({ ...effect, webhookId })}
          />
        </Labeled>
      )}

      {effect.kind === "agent" && (
        <AutomationAgentFields effect={effect} flagged={flagged} runtimes={runtimes} onChange={onChange} />
      )}

      {flagged && <p className="text-xs text-destructive">{t("AutomationRules.builder.fixEffect")}</p>}
    </div>
  );
}
