"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import type {
  AutomationBuilderField,
  AutomationBuilderModel,
} from "@/features/automation-rules/automation-builder-model";
import type {
  AutomationDraft,
  DraftCondition,
  DraftConditionOperator,
  DraftCreateRecord,
  DraftEffect,
  DraftNotify,
  DraftSetField,
  DraftTriggerKind,
} from "@/features/automation-rules/automation-draft";
import type { AutomationRuleDto } from "@/features/automation-rules/automation-rule.schema";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppModal } from "@/components/modal/app-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import {
  DRAFT_CONDITION_OPERATORS,
  DRAFT_TRIGGER_KINDS,
  draftHasRecord,
  draftToUpsert,
  fieldOfList,
  listOf,
} from "@/features/automation-rules/automation-draft";
import { RECORD_NAME_TOKEN } from "@/features/automation-rules/automation-template";

import { upsertAutomationRuleAction } from "../actions";

type Props = {
  draft: AutomationDraft | null;
  model: AutomationBuilderModel;
  onClose: () => void;
  onSaved: (rule: AutomationRuleDto) => void;
};

const DATE_TYPES = new Set(["date", "dateTime"]);
const NOTIFY_KINDS = ["ruleAlert", "dueToday", "replyReceived"] as const;
const BOOLEAN_OPTIONS = ["true", "false"] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <h3 className="text-sm font-semibold">{title}</h3>

      {children}
    </section>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>

      {children}
    </div>
  );
}

function Choose({
  value,
  items,
  placeholder,
  label,
  onChange,
}: {
  value: string;
  items: { id: string; label: string }[];
  placeholder: string;
  label: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>

      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.id} value={item.id}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ValueInput({
  field,
  value,
  label,
  onChange,
}: {
  field: AutomationBuilderField | undefined;
  value: string;
  label: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations();
  if (field?.valueType === "select") {
    return (
      <Choose
        items={field.options}
        label={label}
        placeholder={t("AutomationRules.builder.choose")}
        value={value}
        onChange={onChange}
      />
    );
  }
  if (field?.valueType === "boolean") {
    return (
      <Choose
        items={BOOLEAN_OPTIONS.map((option) => ({ id: option, label: t(`AutomationRules.builder.boolean.${option}`) }))}
        label={label}
        placeholder={t("AutomationRules.builder.choose")}
        value={value}
        onChange={onChange}
      />
    );
  }
  return (
    <Input
      aria-label={label}
      inputMode={field?.valueType === "number" || field?.valueType === "currency" ? "decimal" : undefined}
      placeholder={field?.valueType === "date" ? "2026-12-31" : undefined}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function AutomationBuilder({ draft: initial, model, onClose, onSaved }: Props) {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<AutomationDraft | null>(initial);
  const [shown, setShown] = useState(initial);
  const [invalid, setInvalid] = useState<string[]>([]);
  if (initial !== shown) {
    setShown(initial);
    setDraft(initial);
    setInvalid([]);
  }

  const update = (patch: Partial<AutomationDraft>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current));
  const trigger = draft?.trigger;
  const recordKind = trigger && trigger.kind !== "messageReceived" && trigger.kind !== "other";
  const triggerList = trigger ? listOf(model, trigger.typeId) : undefined;
  const hasRecord = trigger ? draftHasRecord(trigger) : false;
  const triggerFields = (triggerList?.fields ?? []).filter(
    (field) => trigger?.kind !== "dateReached" || DATE_TYPES.has(field.valueType),
  );
  const listItems = model.lists.map((list) => ({ id: list.id, label: list.label }));
  const choose = t("AutomationRules.builder.choose");

  const setTrigger = (patch: Partial<AutomationDraft["trigger"]>) =>
    draft && update({ trigger: { ...draft.trigger, ...patch } });
  const setCondition = (index: number, patch: Partial<DraftCondition>) =>
    draft &&
    update({
      conditions: draft.conditions.map((condition, item) => (item === index ? { ...condition, ...patch } : condition)),
    });
  const setEffect = (index: number, effect: DraftEffect) =>
    draft && update({ effects: draft.effects.map((current, item) => (item === index ? effect : current)) });

  const save = () => {
    if (!draft) return;
    const converted = draftToUpsert(draft, model);
    if (!converted.ok) {
      setInvalid(converted.issues);
      toast.error(t("AutomationRules.builder.incomplete"));
      return;
    }
    setInvalid([]);
    startTransition(async () => {
      const result = await upsertAutomationRuleAction(converted.input);
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return;
      }
      toast.success(t("Common.notifications.updated"));
      onSaved(result.data);
    });
  };

  const flagged = (key: string) => invalid.some((issue) => issue === key || issue.startsWith(`${key}.`));

  return (
    <AppModal
      open={draft !== null}
      size="3xl"
      title={draft?.id ? t("AutomationRules.builder.titleEdit") : t("AutomationRules.builder.titleNew")}
      onClose={onClose}
    >
      {draft && trigger && (
        <AppCard>
          <AppCardBody>
            <div className="flex flex-wrap items-end gap-4">
              <Labeled label={t("AutomationRules.builder.name")}>
                <Input
                  aria-invalid={flagged("name") || undefined}
                  placeholder={t("AutomationRules.builder.namePlaceholder")}
                  value={draft.name}
                  onChange={(event) => update({ name: event.target.value })}
                />
              </Labeled>

              <div className="flex items-center gap-2 pb-2">
                <Switch
                  checked={draft.enabled}
                  id="automation-active"
                  onCheckedChange={(enabled) => update({ enabled })}
                />

                <Label htmlFor="automation-active">{t("AutomationRules.builder.active")}</Label>
              </div>
            </div>

            <Section title={t("AutomationRules.builder.when")}>
              {trigger.kind === "other" ? (
                <p className="text-sm text-muted-foreground">{t("AutomationRules.builder.keptTrigger")}</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  <Labeled label={t("AutomationRules.builder.event")}>
                    <Choose
                      items={DRAFT_TRIGGER_KINDS.map((kind) => ({
                        id: kind,
                        label: t(`AutomationRules.trigger.${kind}`),
                      }))}
                      label={t("AutomationRules.builder.event")}
                      placeholder={choose}
                      value={trigger.kind}
                      onChange={(kind) => setTrigger({ kind: kind as DraftTriggerKind, fieldId: "", value: "" })}
                    />
                  </Labeled>

                  {recordKind && (
                    <Labeled label={t("AutomationRules.builder.list")}>
                      <Choose
                        items={listItems}
                        label={t("AutomationRules.builder.list")}
                        placeholder={choose}
                        value={trigger.typeId}
                        onChange={(typeId) => setTrigger({ typeId, fieldId: "", value: "" })}
                      />
                    </Labeled>
                  )}

                  {(trigger.kind === "recordUpdated" ||
                    trigger.kind === "fieldChanged" ||
                    trigger.kind === "dateReached") && (
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
                        onChange={(fieldId) => setTrigger({ fieldId: fieldId === "none" ? "" : fieldId, value: "" })}
                      />
                    </Labeled>
                  )}

                  {trigger.kind === "fieldChanged" && (
                    <Labeled label={t("AutomationRules.builder.toValue")}>
                      <ValueInput
                        field={fieldOfList(model, trigger.typeId, trigger.fieldId)}
                        label={t("AutomationRules.builder.toValue")}
                        value={trigger.value}
                        onChange={(value) => setTrigger({ value })}
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
                      onChange={(event) => setTrigger({ days: event.target.value })}
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
                      onChange={(direction) => setTrigger({ direction: direction as "before" | "after" })}
                    />
                  </Labeled>

                  <Labeled label={t("AutomationRules.builder.atHour")}>
                    <Input
                      inputMode="numeric"
                      value={trigger.atHour}
                      onChange={(event) => setTrigger({ atHour: event.target.value })}
                    />
                  </Labeled>

                  <Labeled label={t("AutomationRules.builder.timezone")}>
                    <Input
                      value={trigger.timezone}
                      onChange={(event) => setTrigger({ timezone: event.target.value })}
                    />
                  </Labeled>
                </div>
              )}

              {flagged("trigger") && (
                <p className="text-xs text-destructive">{t("AutomationRules.builder.fixTrigger")}</p>
              )}
            </Section>

            {hasRecord && (
              <Section title={t("AutomationRules.builder.if")}>
                {draft.conditions.map((condition, index) => {
                  const field = fieldOfList(model, trigger.typeId, condition.fieldId);
                  const needsValue = !["empty", "notEmpty"].includes(condition.operator);
                  const dateOperator = condition.operator === "before" || condition.operator === "after";
                  return (
                    <div key={index} className="flex flex-wrap items-end gap-3">
                      <Labeled label={t("AutomationRules.builder.field")}>
                        <Choose
                          items={triggerList?.fields ?? []}
                          label={t("AutomationRules.builder.field")}
                          placeholder={choose}
                          value={condition.fieldId}
                          onChange={(fieldId) => setCondition(index, { fieldId, value: "" })}
                        />
                      </Labeled>

                      <Labeled label={t("AutomationRules.builder.operator")}>
                        <Choose
                          items={DRAFT_CONDITION_OPERATORS.filter(
                            (operator) =>
                              !["before", "after"].includes(operator) || DATE_TYPES.has(field?.valueType ?? ""),
                          ).map((operator) => ({ id: operator, label: t(`AutomationRules.operator.${operator}`) }))}
                          label={t("AutomationRules.builder.operator")}
                          placeholder={choose}
                          value={condition.operator}
                          onChange={(operator) =>
                            setCondition(index, { operator: operator as DraftConditionOperator, value: "" })
                          }
                        />
                      </Labeled>

                      {needsValue && (
                        <Labeled
                          label={
                            dateOperator
                              ? t("AutomationRules.builder.daysFromToday")
                              : t("AutomationRules.builder.value")
                          }
                        >
                          {dateOperator ? (
                            <Input
                              inputMode="numeric"
                              value={condition.value}
                              onChange={(event) => setCondition(index, { value: event.target.value })}
                            />
                          ) : (
                            <ValueInput
                              field={field}
                              label={t("AutomationRules.builder.value")}
                              value={condition.value}
                              onChange={(value) => setCondition(index, { value })}
                            />
                          )}
                        </Labeled>
                      )}

                      <Button
                        aria-label={t("Common.actions.remove")}
                        size="icon"
                        variant="ghostDestructive"
                        onClick={() => update({ conditions: draft.conditions.filter((_, item) => item !== index) })}
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </Button>
                    </div>
                  );
                })}

                {flagged("conditions") && (
                  <p className="text-xs text-destructive">{t("AutomationRules.builder.fixConditions")}</p>
                )}

                <div>
                  <Button
                    disabled={!triggerList || draft.conditions.length >= 20}
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      update({
                        conditions: [
                          ...draft.conditions,
                          { fieldId: triggerList?.fields[0]?.id ?? "", operator: "equals", value: "" },
                        ],
                      })
                    }
                  >
                    <Plus aria-hidden="true" className="size-4" />

                    {t("AutomationRules.builder.addCondition")}
                  </Button>
                </div>
              </Section>
            )}

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
                          onChange={(kind) => setEffect(index, blankEffect(kind, model, trigger.typeId))}
                        />
                      </Labeled>
                    )}

                    <Button
                      aria-label={t("Common.actions.remove")}
                      size="icon"
                      variant="ghostDestructive"
                      onClick={() => update({ effects: draft.effects.filter((_, item) => item !== index) })}
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
                      triggerTypeId={trigger.typeId}
                      onChange={(next) => setEffect(index, next)}
                    />
                  )}

                  {effect.kind === "setField" && (
                    <SetFieldEditor
                      effect={effect}
                      fields={(triggerList?.fields ?? []).filter((field) => field.writable)}
                      model={model}
                      triggerTypeId={trigger.typeId}
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
                  disabled={draft.effects.length >= 10}
                  size="sm"
                  variant="secondary"
                  onClick={() => update({ effects: [...draft.effects, blankEffect("notify", model, trigger.typeId)] })}
                >
                  <Plus aria-hidden="true" className="size-4" />

                  {t("AutomationRules.builder.addEffect")}
                </Button>
              </div>
            </Section>
          </AppCardBody>

          <AppCardFooter>
            <Button variant="ghost" onClick={onClose}>
              {t("Common.actions.cancel")}
            </Button>

            <Button disabled={pending} onClick={save}>
              {t("Common.actions.save")}
            </Button>
          </AppCardFooter>
        </AppCard>
      )}
    </AppModal>
  );
}

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

function NotifyEditor({
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
            items={NOTIFY_KINDS.map((kind) => ({ id: kind, label: t(`AutomationRules.notificationKind.${kind}`) }))}
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
        <span className="flex items-center gap-2">
          <Switch
            checked={effect.toOwner}
            id="notify-owner"
            onCheckedChange={(toOwner) => onChange({ ...effect, toOwner })}
          />

          <Label htmlFor="notify-owner">{t("AutomationRules.builder.toOwner")}</Label>
        </span>

        {hasRecord && (
          <span className="flex items-center gap-2">
            <Switch
              checked={effect.toAssignees}
              id="notify-assignees"
              onCheckedChange={(toAssignees) => onChange({ ...effect, toAssignees })}
            />

            <Label htmlFor="notify-assignees">{t("AutomationRules.builder.toAssignees")}</Label>
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {t("AutomationRules.builder.placeholders", { recordName: "{{record.name}}", ruleName: "{{rule.name}}" })}
      </p>
    </div>
  );
}

function CreateRecordEditor({
  effect,
  model,
  hasRecord,
  triggerTypeId,
  onChange,
}: {
  effect: DraftCreateRecord;
  model: AutomationBuilderModel;
  hasRecord: boolean;
  triggerTypeId: string;
  onChange: (effect: DraftCreateRecord) => void;
}) {
  const t = useTranslations();
  const list = listOf(model, effect.typeId);
  const writable = (list?.fields ?? []).filter((field) => field.writable);
  const relations = model.relationships.filter(
    (relation) =>
      (relation.sourceTypeId === effect.typeId && relation.targetTypeId === triggerTypeId) ||
      (relation.targetTypeId === effect.typeId && relation.sourceTypeId === triggerTypeId),
  );
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
              ...writable.filter((field) => DATE_TYPES.has(field.valueType)),
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

        {hasRecord && relations.length > 0 && (
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

      <span className="flex items-center gap-2">
        <Switch
          checked={effect.assignToOwner}
          id="assign-owner"
          onCheckedChange={(assignToOwner) => onChange({ ...effect, assignToOwner })}
        />

        <Label htmlFor="assign-owner">{t("AutomationRules.builder.assignToOwner")}</Label>
      </span>
    </div>
  );
}

function SetFieldEditor({
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
