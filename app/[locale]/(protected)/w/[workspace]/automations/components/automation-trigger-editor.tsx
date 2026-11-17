"use client";

import { useTranslations } from "next-intl";

import type { AutomationBuilderModel } from "./automation-builder-model";
import type { AutomationDraft, DraftTriggerKind } from "./automation-draft";

import { Input } from "@/components/ui/input";

import { DRAFT_TRIGGER_KINDS, fieldOfList, listOf } from "./automation-draft";
import { Choose, DATE_FIELD_TYPES, Labeled, TimeZonePicker, ValueInput } from "./automation-builder-fields";

type Props = {
  trigger: AutomationDraft["trigger"];
  model: AutomationBuilderModel;
  flagged: (key: string) => boolean;
  onChange: (patch: Partial<AutomationDraft["trigger"]>) => void;
};

export function AutomationTriggerEditor({ trigger, model, flagged, onChange }: Props) {
  const t = useTranslations();
  const choose = t("AutomationRules.builder.choose");
  const recordKind = trigger.kind !== "messageReceived" && trigger.kind !== "other";
  const optionalList = trigger.kind === "formSubmitted" || trigger.kind === "webhookReceived";
  const triggerFields = (listOf(model, trigger.typeId)?.fields ?? []).filter(
    (field) => trigger.kind !== "dateReached" || DATE_FIELD_TYPES.has(field.valueType),
  );
  const listItems = [
    ...(optionalList ? [{ id: "none", label: t("Automations.builder.anyList") }] : []),
    ...model.lists.map((list) => ({ id: list.id, label: list.label })),
  ];

  return (
    <div className="flex flex-col gap-3">
      {trigger.kind === "other" ? (
        <p className="text-sm text-muted-foreground">{t("AutomationRules.builder.keptTrigger")}</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Labeled label={t("AutomationRules.builder.event")}>
            <Choose
              items={DRAFT_TRIGGER_KINDS.map((kind) => ({ id: kind, label: t(`AutomationRules.trigger.${kind}`) }))}
              label={t("AutomationRules.builder.event")}
              placeholder={choose}
              value={trigger.kind}
              onChange={(kind) => onChange({ kind: kind as DraftTriggerKind, fieldId: "", value: "" })}
            />
          </Labeled>

          {recordKind && (
            <Labeled label={t("AutomationRules.builder.list")}>
              <Choose
                items={listItems}
                label={t("AutomationRules.builder.list")}
                placeholder={choose}
                value={trigger.typeId || (optionalList ? "none" : "")}
                onChange={(typeId) => onChange({ typeId: typeId === "none" ? "" : typeId, fieldId: "", value: "" })}
              />
            </Labeled>
          )}

          {(trigger.kind === "recordUpdated" || trigger.kind === "fieldChanged" || trigger.kind === "dateReached") && (
            <Labeled
              label={
                trigger.kind === "dateReached"
                  ? t("AutomationRules.builder.dateField")
                  : t("AutomationRules.builder.field")
              }
            >
              <Choose
                items={
                  trigger.kind === "recordUpdated"
                    ? [{ id: "none", label: t("AutomationRules.builder.anyField") }, ...triggerFields]
                    : triggerFields
                }
                label={t("AutomationRules.builder.field")}
                placeholder={choose}
                value={trigger.fieldId || (trigger.kind === "recordUpdated" ? "none" : "")}
                onChange={(fieldId) => onChange({ fieldId: fieldId === "none" ? "" : fieldId, value: "" })}
              />
            </Labeled>
          )}

          {trigger.kind === "fieldChanged" && (
            <Labeled label={t("AutomationRules.builder.toValue")}>
              <ValueInput
                field={fieldOfList(model, trigger.typeId, trigger.fieldId)}
                label={t("AutomationRules.builder.toValue")}
                value={trigger.value}
                onChange={(value) => onChange({ value })}
              />
            </Labeled>
          )}
        </div>
      )}

      {trigger.kind === "dateReached" && (
        <div className="flex flex-wrap gap-3">
          <Labeled label={t("AutomationRules.builder.days")}>
            <Input
              aria-invalid={flagged("trigger") || undefined}
              inputMode="numeric"
              value={trigger.days}
              onChange={(event) => onChange({ days: event.target.value })}
            />
          </Labeled>

          <Labeled label={t("AutomationRules.builder.direction")}>
            <Choose
              items={[
                { id: "before", label: t("AutomationRules.builder.before") },
                { id: "after", label: t("AutomationRules.builder.after") },
              ]}
              label={t("AutomationRules.builder.direction")}
              placeholder={choose}
              value={trigger.direction}
              onChange={(direction) => onChange({ direction: direction as "before" | "after" })}
            />
          </Labeled>

          <Labeled label={t("AutomationRules.builder.atHour")}>
            <Input
              inputMode="numeric"
              value={trigger.atHour}
              onChange={(event) => onChange({ atHour: event.target.value })}
            />
          </Labeled>

          <Labeled label={t("AutomationRules.builder.timezone")}>
            <TimeZonePicker
              label={t("AutomationRules.builder.timezone")}
              value={trigger.timezone}
              onChange={(timezone) => onChange({ timezone })}
            />
          </Labeled>
        </div>
      )}

      {flagged("trigger") && <p className="text-xs text-destructive">{t("AutomationRules.builder.fixTrigger")}</p>}
    </div>
  );
}
