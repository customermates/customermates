"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { AutomationBuilderModel } from "./automation-builder-model";
import type { AutomationDraft, DraftCondition, DraftConditionOperator } from "./automation-draft";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AUTOMATION_CONDITION_LIMIT } from "@/features/automation-rules/automation-rule.schema";

import { DRAFT_CONDITION_OPERATORS, fieldOfList, listOf } from "./automation-draft";
import { Choose, DATE_FIELD_TYPES, Labeled, Section, ValueInput } from "./automation-builder-fields";

type Props = {
  draft: AutomationDraft;
  model: AutomationBuilderModel;
  flagged: (key: string) => boolean;
  onChange: (conditions: DraftCondition[]) => void;
};

export function AutomationConditionsEditor({ draft, model, flagged, onChange }: Props) {
  const t = useTranslations();
  const choose = t("AutomationRules.builder.choose");
  const { typeId } = draft.trigger;
  const triggerList = listOf(model, typeId);
  const setCondition = (index: number, patch: Partial<DraftCondition>) =>
    onChange(draft.conditions.map((condition, item) => (item === index ? { ...condition, ...patch } : condition)));

  return (
    <Section title={t("AutomationRules.builder.if")}>
      {draft.conditions.map((condition, index) => {
        const field = fieldOfList(model, typeId, condition.fieldId);
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
                  (operator) => !["before", "after"].includes(operator) || DATE_FIELD_TYPES.has(field?.valueType ?? ""),
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
                label={dateOperator ? t("AutomationRules.builder.daysFromToday") : t("AutomationRules.builder.value")}
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
              onClick={() => onChange(draft.conditions.filter((_, item) => item !== index))}
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
          disabled={!triggerList || draft.conditions.length >= AUTOMATION_CONDITION_LIMIT}
          size="sm"
          variant="secondary"
          onClick={() =>
            onChange([
              ...draft.conditions,
              { fieldId: triggerList?.fields[0]?.id ?? "", operator: "equals", value: "" },
            ])
          }
        >
          <Plus aria-hidden="true" className="size-4" />

          {t("AutomationRules.builder.addCondition")}
        </Button>
      </div>
    </Section>
  );
}
