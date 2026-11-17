"use client";

import { useTranslations } from "next-intl";

import type { AgentRuntimeAvailability } from "@/features/automation-rules/agent-runtime-availability";
import type { AutomationBuilderModel } from "./automation-builder-model";
import type { DraftEffect, DraftTrigger, DraftUnavailableKind } from "./automation-draft";
import type { WebhookOption } from "./automation-webhook-options";

import { draftHasRecord, fieldTakesValue, listOf, pickableWebhooks } from "./automation-draft";
import { AutomationAgentFields } from "./automation-agent-fields";
import { Choose, Labeled, UnavailableNote } from "./automation-builder-fields";
import { CreateRecordEditor, NotifyEditor, SetFieldEditor } from "./automation-effect-editors";

type Props = {
  effect: DraftEffect;
  trigger: DraftTrigger;
  model: AutomationBuilderModel;
  runtimes: AgentRuntimeAvailability;
  webhooks: WebhookOption[] | null;
  flagged: boolean;
  unavailable?: DraftUnavailableKind;
  onChange: (effect: DraftEffect) => void;
};

export function AutomationEffectFields({
  effect,
  trigger,
  model,
  runtimes,
  webhooks,
  flagged,
  unavailable,
  onChange,
}: Props) {
  const t = useTranslations();
  const hasRecord = draftHasRecord(trigger);
  const triggerList = listOf(model, trigger.typeId);

  return (
    <div className="flex flex-col gap-3">
      <UnavailableNote what={unavailable} />

      {effect.kind === "kept" && (
        <p className="text-sm text-muted-foreground" data-automation-kept="effect">
          {t("AutomationRules.builder.keptEffect", { kind: effect.effect.kind })}
        </p>
      )}

      {effect.kind === "notify" && <NotifyEditor effect={effect} hasRecord={hasRecord} onChange={onChange} />}

      {effect.kind === "createRecord" && (
        <CreateRecordEditor effect={effect} model={model} trigger={trigger} onChange={onChange} />
      )}

      {effect.kind === "setField" && (
        <SetFieldEditor
          effect={effect}
          fields={(triggerList?.fields ?? []).filter((field) => field.writable && fieldTakesValue(field))}
          model={model}
          triggerTypeId={trigger.typeId}
          onChange={onChange}
        />
      )}

      {effect.kind === "callWebhook" &&
        (webhooks === null ? (
          <p className="text-sm text-muted-foreground" data-automation-webhook-restricted="">
            {t("Automations.builder.webhookRestricted")}
          </p>
        ) : (
          <>
            <Labeled label={t("Automations.builder.webhook")}>
              <Choose
                items={pickableWebhooks(webhooks, effect.webhookId)}
                label={t("Automations.builder.webhook")}
                placeholder={t("AutomationRules.builder.choose")}
                value={effect.webhookId}
                onChange={(webhookId) => onChange({ ...effect, webhookId })}
              />
            </Labeled>

            {pickableWebhooks(webhooks, effect.webhookId).length === 0 && (
              <p className="text-xs text-muted-foreground" data-automation-webhook-none="">
                {t("Automations.builder.webhookNoneSubscribed")}
              </p>
            )}
          </>
        ))}

      {effect.kind === "agent" && (
        <AutomationAgentFields effect={effect} flagged={flagged} runtimes={runtimes} onChange={onChange} />
      )}

      {flagged && !unavailable && <p className="text-xs text-destructive">{t("AutomationRules.builder.fixEffect")}</p>}
    </div>
  );
}
