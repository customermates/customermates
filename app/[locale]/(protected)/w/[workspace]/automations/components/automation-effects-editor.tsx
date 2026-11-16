"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { AutomationBuilderModel } from "./automation-builder-model";
import type { AutomationDraft, DraftEffect } from "./automation-draft";

import { Button } from "@/components/ui/button";
import { AUTOMATION_EFFECT_LIMIT } from "@/features/automation-rules/automation-rule.schema";
import { RECORD_NAME_TOKEN } from "@/features/automation-rules/automation-template";

import { draftHasRecord, listOf } from "./automation-draft";
import { Choose, Labeled, Section } from "./automation-builder-fields";
import { CreateRecordEditor, NotifyEditor, SetFieldEditor } from "./automation-effect-editors";

type Props = {
  draft: AutomationDraft;
  model: AutomationBuilderModel;
  flagged: (key: string) => boolean;
  onChange: (effects: DraftEffect[]) => void;
};

function blankEffect(kind: string, model: AutomationBuilderModel, triggerTypeId: string): DraftEffect {
  if (kind === "createRecord") {
    const list = model.lists.find((item) => item.id !== triggerTypeId) ?? model.lists[0];
    const title = list?.fields.find((field) => field.writable && field.valueType === "text");
    return {
      kind: "createRecord",
      typeId: list?.id ?? "",
      titleFieldId: title?.id ?? "",
      title: RECORD_NAME_TOKEN,
      dueFieldId: "",
      dueDays: "",
      assignToOwner: true,
      relationId: "",
    };
  }
  if (kind === "setField") return { kind: "setField", fieldId: "", value: "" };
  return {
    kind: "notify",
    toOwner: true,
    toAssignees: false,
    notificationKind: "ruleAlert",
    title: RECORD_NAME_TOKEN,
    body: "",
  };
}

export function AutomationEffectsEditor({ draft, model, flagged, onChange }: Props) {
  const t = useTranslations();
  const choose = t("AutomationRules.builder.choose");
  const { typeId } = draft.trigger;
  const hasRecord = draftHasRecord(draft.trigger);
  const triggerList = listOf(model, typeId);
  const setEffect = (index: number, effect: DraftEffect) =>
    onChange(draft.effects.map((current, item) => (item === index ? effect : current)));

  return (
    <Section title={t("AutomationRules.builder.then")}>
      {draft.effects.map((effect, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-md bg-muted/40 p-3">
          <div className="flex items-end justify-between gap-3">
            {effect.kind === "kept" ? (
              <p className="text-sm text-muted-foreground">
                {t("AutomationRules.builder.keptEffect", { kind: effect.effect.kind })}
              </p>
            ) : (
              <Labeled label={t("AutomationRules.builder.action")}>
                <Choose
                  items={(["notify", "createRecord", "setField"] as const)
                    .filter((kind) => hasRecord || kind !== "setField")
                    .map((kind) => ({ id: kind, label: t(`AutomationRules.effect.${kind}`) }))}
                  label={t("AutomationRules.builder.action")}
                  placeholder={choose}
                  value={effect.kind}
                  onChange={(kind) => setEffect(index, blankEffect(kind, model, typeId))}
                />
              </Labeled>
            )}

            <Button
              aria-label={t("Common.actions.remove")}
              size="icon"
              variant="ghostDestructive"
              onClick={() => onChange(draft.effects.filter((_, item) => item !== index))}
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </Button>
          </div>

          {effect.kind === "notify" && (
            <NotifyEditor effect={effect} hasRecord={hasRecord} onChange={(next) => setEffect(index, next)} />
          )}

          {effect.kind === "createRecord" && (
            <CreateRecordEditor
              effect={effect}
              hasRecord={hasRecord}
              model={model}
              triggerTypeId={typeId}
              onChange={(next) => setEffect(index, next)}
            />
          )}

          {effect.kind === "setField" && (
            <SetFieldEditor
              effect={effect}
              fields={(triggerList?.fields ?? []).filter((field) => field.writable)}
              model={model}
              triggerTypeId={typeId}
              onChange={(next) => setEffect(index, next)}
            />
          )}

          {flagged(`effects.${index}`) && (
            <p className="text-xs text-destructive">{t("AutomationRules.builder.fixEffect")}</p>
          )}
        </div>
      ))}

      <div>
        <Button
          disabled={draft.effects.length >= AUTOMATION_EFFECT_LIMIT}
          size="sm"
          variant="secondary"
          onClick={() => onChange([...draft.effects, blankEffect("notify", model, typeId)])}
        >
          <Plus aria-hidden="true" className="size-4" />

          {t("AutomationRules.builder.addEffect")}
        </Button>
      </div>
    </Section>
  );
}
