"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";

import type { AutomationBuilderField, AutomationBuilderModel } from "./automation-builder-model";
import type { DraftCreateRecord, DraftNotify, DraftSetField, DraftTrigger } from "./automation-draft";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AUTOMATION_NOTIFY_KINDS } from "@/features/automation-rules/automation-rule.schema";

import { fieldOfList, linkRelationsFor, listOf } from "./automation-draft";
import { Choose, DATE_FIELD_TYPES, Labeled, ValueInput } from "./automation-builder-fields";

function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <span className="flex items-center gap-2">
      <Switch checked={checked} id={id} onCheckedChange={onChange} />

      <Label htmlFor={id}>{label}</Label>
    </span>
  );
}

export function NotifyEditor({
  effect,
  hasRecord,
  onChange,
}: {
  effect: DraftNotify;
  hasRecord: boolean;
  onChange: (effect: DraftNotify) => void;
}) {
  const t = useTranslations();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Labeled label={t("AutomationRules.builder.title")}>
          <Input value={effect.title} onChange={(event) => onChange({ ...effect, title: event.target.value })} />
        </Labeled>

        <Labeled label={t("AutomationRules.builder.notificationKind")}>
          <Choose
            items={AUTOMATION_NOTIFY_KINDS.map((kind) => ({
              id: kind,
              label: t(`AutomationRules.notificationKind.${kind}`),
            }))}
            label={t("AutomationRules.builder.notificationKind")}
            placeholder={t("AutomationRules.builder.choose")}
            value={effect.notificationKind}
            onChange={(notificationKind) =>
              onChange({ ...effect, notificationKind: notificationKind as DraftNotify["notificationKind"] })
            }
          />
        </Labeled>
      </div>

      <Labeled label={t("AutomationRules.builder.body")}>
        <Input value={effect.body} onChange={(event) => onChange({ ...effect, body: event.target.value })} />
      </Labeled>

      <div className="flex flex-wrap items-center gap-6">
        <SwitchRow
          checked={effect.toOwner}
          label={t("AutomationRules.builder.toOwner")}
          onChange={(toOwner) => onChange({ ...effect, toOwner })}
        />

        {hasRecord && (
          <SwitchRow
            checked={effect.toAssignees}
            label={t("AutomationRules.builder.toAssignees")}
            onChange={(toAssignees) => onChange({ ...effect, toAssignees })}
          />
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {t("AutomationRules.builder.placeholders", { recordName: "{{record.name}}", ruleName: "{{rule.name}}" })}
      </p>
    </div>
  );
}

export function CreateRecordEditor({
  effect,
  model,
  trigger,
  onChange,
}: {
  effect: DraftCreateRecord;
  model: AutomationBuilderModel;
  trigger: DraftTrigger;
  onChange: (effect: DraftCreateRecord) => void;
}) {
  const t = useTranslations();
  const list = listOf(model, effect.typeId);
  const writable = (list?.fields ?? []).filter((field) => field.writable);
  const relations = linkRelationsFor(model, effect.typeId, trigger);
  const choose = t("AutomationRules.builder.choose");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Labeled label={t("AutomationRules.builder.list")}>
          <Choose
            items={model.lists.map((item) => ({ id: item.id, label: item.label }))}
            label={t("AutomationRules.builder.list")}
            placeholder={choose}
            value={effect.typeId}
            onChange={(typeId) => onChange({ ...effect, typeId, titleFieldId: "", dueFieldId: "", relationId: "" })}
          />
        </Labeled>

        <Labeled label={t("AutomationRules.builder.titleField")}>
          <Choose
            items={writable.filter((field) => field.valueType === "text")}
            label={t("AutomationRules.builder.titleField")}
            placeholder={choose}
            value={effect.titleFieldId}
            onChange={(titleFieldId) => onChange({ ...effect, titleFieldId })}
          />
        </Labeled>
      </div>

      <Labeled label={t("AutomationRules.builder.title")}>
        <Input value={effect.title} onChange={(event) => onChange({ ...effect, title: event.target.value })} />
      </Labeled>

      <div className="flex flex-wrap gap-3">
        <Labeled label={t("AutomationRules.builder.dueField")}>
          <Choose
            items={[
              { id: "none", label: t("AutomationRules.builder.noDueDate") },
              ...writable.filter((field) => DATE_FIELD_TYPES.has(field.valueType)),
            ]}
            label={t("AutomationRules.builder.dueField")}
            placeholder={choose}
            value={effect.dueFieldId || "none"}
            onChange={(dueFieldId) => onChange({ ...effect, dueFieldId: dueFieldId === "none" ? "" : dueFieldId })}
          />
        </Labeled>

        {effect.dueFieldId && (
          <Labeled label={t("AutomationRules.builder.dueDays")}>
            <Input
              inputMode="numeric"
              value={effect.dueDays}
              onChange={(event) => onChange({ ...effect, dueDays: event.target.value })}
            />
          </Labeled>
        )}

        {relations.length > 0 && (
          <Labeled label={t("AutomationRules.builder.linkTo")}>
            <Choose
              items={[
                { id: "none", label: t("AutomationRules.builder.noLink") },
                ...relations.map((relation) => ({
                  id: relation.id,
                  label: relation.sourceTypeId === effect.typeId ? relation.sourceLabel : relation.targetLabel,
                })),
              ]}
              label={t("AutomationRules.builder.linkTo")}
              placeholder={choose}
              value={effect.relationId || "none"}
              onChange={(relationId) => onChange({ ...effect, relationId: relationId === "none" ? "" : relationId })}
            />
          </Labeled>
        )}
      </div>

      <SwitchRow
        checked={effect.assignToOwner}
        label={t("AutomationRules.builder.assignToOwner")}
        onChange={(assignToOwner) => onChange({ ...effect, assignToOwner })}
      />
    </div>
  );
}

export function SetFieldEditor({
  effect,
  fields,
  model,
  triggerTypeId,
  onChange,
}: {
  effect: DraftSetField;
  fields: AutomationBuilderField[];
  model: AutomationBuilderModel;
  triggerTypeId: string;
  onChange: (effect: DraftSetField) => void;
}) {
  const t = useTranslations();
  return (
    <div className="flex flex-wrap gap-3">
      <Labeled label={t("AutomationRules.builder.field")}>
        <Choose
          items={fields}
          label={t("AutomationRules.builder.field")}
          placeholder={t("AutomationRules.builder.choose")}
          value={effect.fieldId}
          onChange={(fieldId) => onChange({ ...effect, fieldId, value: "" })}
        />
      </Labeled>

      <Labeled label={t("AutomationRules.builder.value")}>
        <ValueInput
          field={fieldOfList(model, triggerTypeId, effect.fieldId)}
          label={t("AutomationRules.builder.value")}
          value={effect.value}
          onChange={(value) => onChange({ ...effect, value })}
        />
      </Labeled>
    </div>
  );
}
