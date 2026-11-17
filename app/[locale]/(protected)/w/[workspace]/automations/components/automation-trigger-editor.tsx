"use client";

import { useTranslations } from "next-intl";

import type { AutomationBuilderModel } from "./automation-builder-model";
import type { AutomationDraft, DraftMessageChannel, DraftTriggerKind, DraftUnavailableKind } from "./automation-draft";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { DRAFT_MESSAGE_CHANNELS, DRAFT_TRIGGER_KINDS, fieldOfList, fieldTakesValue, listOf } from "./automation-draft";
import {
  Choose,
  DATE_FIELD_TYPES,
  FieldRow,
  Labeled,
  PickMany,
  TimeZonePicker,
  UnavailableNote,
  ValueInput,
} from "./automation-builder-fields";

type Props = {
  trigger: AutomationDraft["trigger"];
  model: AutomationBuilderModel;
  flagged: (key: string) => boolean;
  unavailable?: DraftUnavailableKind;
  onChange: (patch: Partial<AutomationDraft["trigger"]>) => void;
};

function channelLabel(t: ReturnType<typeof useTranslations>, channel: DraftMessageChannel): string {
  switch (channel) {
    case "any":
      return t("AutomationRules.builder.channelAny");
    case "email":
      return t("AutomationRules.builder.channelEmail");
    case "chat":
      return t("AutomationRules.builder.channelChat");
  }
}

export function AutomationTriggerEditor({ trigger, model, flagged, unavailable, onChange }: Props) {
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
  const changedField = fieldOfList(model, trigger.typeId, trigger.fieldId);

  return (
    <div className="flex flex-col gap-3">
      <UnavailableNote what={unavailable} />

      {trigger.kind === "other" ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground" data-automation-kept="trigger">
            {t("AutomationRules.builder.keptTrigger")}
          </p>

          <Button
            size="sm"
            type="button"
            variant="secondary"
            onClick={() =>
              onChange({
                kind: "recordCreated",
                kept: null,
                typeId: model.lists[0]?.id ?? "",
                fieldId: "",
                fieldIds: [],
                value: "",
              })
            }
          >
            {t("AutomationRules.builder.keptTriggerReplace")}
          </Button>
        </div>
      ) : (
        <FieldRow>
          <Labeled label={t("AutomationRules.builder.event")}>
            <Choose
              items={DRAFT_TRIGGER_KINDS.map((kind) => ({ id: kind, label: t(`AutomationRules.trigger.${kind}`) }))}
              label={t("AutomationRules.builder.event")}
              placeholder={choose}
              value={trigger.kind}
              onChange={(kind) => onChange({ kind: kind as DraftTriggerKind, fieldId: "", fieldIds: [], value: "" })}
            />
          </Labeled>

          {recordKind && (
            <Labeled label={t("AutomationRules.builder.list")}>
              <Choose
                items={listItems}
                label={t("AutomationRules.builder.list")}
                placeholder={choose}
                value={trigger.typeId || (optionalList ? "none" : "")}
                onChange={(typeId) =>
                  onChange({ typeId: typeId === "none" ? "" : typeId, fieldId: "", fieldIds: [], value: "" })
                }
              />
            </Labeled>
          )}

          {trigger.kind === "messageReceived" && (
            <Labeled label={t("AutomationRules.builder.channel")}>
              <Choose
                items={DRAFT_MESSAGE_CHANNELS.map((channel) => ({ id: channel, label: channelLabel(t, channel) }))}
                label={t("AutomationRules.builder.channel")}
                placeholder={choose}
                value={trigger.channel}
                onChange={(channel) => onChange({ channel: channel as DraftMessageChannel })}
              />
            </Labeled>
          )}

          {(trigger.kind === "fieldChanged" || trigger.kind === "dateReached") && (
            <Labeled
              label={
                trigger.kind === "dateReached"
                  ? t("AutomationRules.builder.dateField")
                  : t("AutomationRules.builder.field")
              }
            >
              <Choose
                items={triggerFields}
                label={t("AutomationRules.builder.field")}
                placeholder={choose}
                value={trigger.fieldId}
                onChange={(fieldId) => onChange({ fieldId, value: "" })}
              />
            </Labeled>
          )}

          {trigger.kind === "fieldChanged" && changedField && fieldTakesValue(changedField) && (
            <Labeled label={t("AutomationRules.builder.toValue")}>
              <ValueInput
                field={changedField}
                label={t("AutomationRules.builder.toValue")}
                value={trigger.value}
                onChange={(value) => onChange({ value })}
              />
            </Labeled>
          )}
        </FieldRow>
      )}

      {trigger.kind === "recordUpdated" && (
        <Labeled label={t("AutomationRules.builder.field")}>
          <PickMany
            items={triggerFields}
            label={t("AutomationRules.builder.field")}
            values={trigger.fieldIds}
            onChange={(fieldIds) => onChange({ fieldIds })}
          />

          {trigger.fieldIds.length === 0 && (
            <p className="text-xs text-muted-foreground">{t("AutomationRules.builder.anyField")}</p>
          )}
        </Labeled>
      )}

      {trigger.kind === "dateReached" && (
        <FieldRow>
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
        </FieldRow>
      )}

      {flagged("trigger") && !unavailable && (
        <p className="text-xs text-destructive">{t("AutomationRules.builder.fixTrigger")}</p>
      )}
    </div>
  );
}
