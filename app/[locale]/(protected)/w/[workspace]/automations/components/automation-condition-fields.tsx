"use client";

import { useTranslations } from "next-intl";

import type { AutomationBuilderModel } from "./automation-builder-model";
import type { DraftCondition, DraftConditionOperator, DraftUnavailableKind } from "./automation-draft";

import { Input } from "@/components/ui/input";

import { conditionOperatorsFor, fieldOfList, listOf } from "./automation-draft";
import { Choose, Labeled, PickMany, UnavailableNote, ValueInput } from "./automation-builder-fields";

type Props = {
  condition: DraftCondition;
  typeId: string;
  model: AutomationBuilderModel;
  flagged: boolean;
  unavailable?: DraftUnavailableKind;
  onChange: (patch: Partial<DraftCondition>) => void;
};

function operatorLabel(t: ReturnType<typeof useTranslations>, operator: DraftConditionOperator): string {
  if (operator === "in") return t("AutomationRules.operator.in");
  if (operator === "notIn") return t("AutomationRules.operator.notIn");
  return t(`AutomationRules.operator.${operator}`);
}

export function AutomationConditionFields({ condition, typeId, model, flagged, unavailable, onChange }: Props) {
  const t = useTranslations();
  const choose = t("AutomationRules.builder.choose");

  if (condition.kept) {
    return (
      <div className="flex flex-col gap-3">
        <UnavailableNote what={unavailable} />

        <p className="text-sm text-muted-foreground" data-automation-kept="condition">
          {t("AutomationRules.builder.keptCondition")}
        </p>
      </div>
    );
  }

  const fields = listOf(model, typeId)?.fields ?? [];
  const field = fieldOfList(model, typeId, condition.fieldId);
  const operators = conditionOperatorsFor(field);
  const needsValue = !["empty", "notEmpty"].includes(condition.operator);
  const dateOperator = condition.operator === "before" || condition.operator === "after";
  const listOperator = condition.operator === "in" || condition.operator === "notIn";

  const changeField = (fieldId: string) => {
    const offered = conditionOperatorsFor(fields.find((item) => item.id === fieldId));
    const operator = offered.includes(condition.operator) ? condition.operator : (offered[0] ?? "empty");
    onChange({ fieldId, operator, value: "", values: [] });
  };

  return (
    <div className="flex flex-col gap-3">
      <UnavailableNote what={unavailable} />

      <div className="flex flex-wrap gap-3">
        <Labeled label={t("AutomationRules.builder.field")}>
          <Choose
            items={fields}
            label={t("AutomationRules.builder.field")}
            placeholder={choose}
            value={condition.fieldId}
            onChange={changeField}
          />
        </Labeled>

        <Labeled label={t("AutomationRules.builder.operator")}>
          <Choose
            items={operators.map((operator) => ({ id: operator, label: operatorLabel(t, operator) }))}
            label={t("AutomationRules.builder.operator")}
            placeholder={choose}
            value={condition.operator}
            onChange={(operator) => onChange({ operator: operator as DraftConditionOperator, value: "", values: [] })}
          />
        </Labeled>

        {needsValue && !listOperator && (
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

      {listOperator && (
        <Labeled label={t("AutomationRules.builder.value")}>
          <PickMany
            items={field?.options ?? []}
            label={t("AutomationRules.builder.value")}
            values={condition.values}
            onChange={(values) => onChange({ values })}
          />
        </Labeled>
      )}

      {flagged && !unavailable && (
        <p className="text-xs text-destructive">{t("AutomationRules.builder.fixConditions")}</p>
      )}
    </div>
  );
}
