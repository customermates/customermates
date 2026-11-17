"use client";

import { useTranslations } from "next-intl";

import type { AutomationBuilderModel } from "./automation-builder-model";
import type { DraftCondition, DraftConditionOperator } from "./automation-draft";

import { Input } from "@/components/ui/input";

import { DRAFT_CONDITION_OPERATORS, fieldOfList, listOf } from "./automation-draft";
import { Choose, DATE_FIELD_TYPES, Labeled, ValueInput } from "./automation-builder-fields";

type Props = {
  condition: DraftCondition;
  typeId: string;
  model: AutomationBuilderModel;
  flagged: boolean;
  onChange: (patch: Partial<DraftCondition>) => void;
};

export function AutomationConditionFields({ condition, typeId, model, flagged, onChange }: Props) {
  const t = useTranslations();
  const choose = t("AutomationRules.builder.choose");
  const field = fieldOfList(model, typeId, condition.fieldId);
  const needsValue = !["empty", "notEmpty"].includes(condition.operator);
  const dateOperator = condition.operator === "before" || condition.operator === "after";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Labeled label={t("AutomationRules.builder.field")}>
          <Choose
            items={listOf(model, typeId)?.fields ?? []}
            label={t("AutomationRules.builder.field")}
            placeholder={choose}
            value={condition.fieldId}
            onChange={(fieldId) => onChange({ fieldId, value: "" })}
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
            onChange={(operator) => onChange({ operator: operator as DraftConditionOperator, value: "" })}
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
                onChange={(event) => onChange({ value: event.target.value })}
              />
            ) : (
              <ValueInput
                field={field}
                label={t("AutomationRules.builder.value")}
                value={condition.value}
                onChange={(value) => onChange({ value })}
              />
            )}
          </Labeled>
        )}
      </div>

      {flagged && <p className="text-xs text-destructive">{t("AutomationRules.builder.fixConditions")}</p>}
    </div>
  );
}
