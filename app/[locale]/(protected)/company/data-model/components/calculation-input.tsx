"use client";

import { useTranslations } from "next-intl";

import type { CalculationExpression, RecordModel, RecordScalar } from "@/features/records/record-model.schema";

import { FormSelect } from "@/components/forms/form-select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const zero: CalculationExpression = {
  kind: "literal",
  value: { kind: "decimal", value: "0", currency: null },
};
export function CalculationInput({
  model,
  typeId,
  value,
  onChange,
  path = "expression",
  depth = 0,
}: {
  model: RecordModel;
  typeId: string;
  value: CalculationExpression;
  onChange: (value: CalculationExpression) => void;
  path?: string;
  depth?: number;
}) {
  const t = useTranslations();
  const fields = model.fields.filter((field) => field.typeId === typeId && !field.archived);
  const relations = model.relationships.filter(
    (relation) => !relation.archived && (relation.sourceTypeId === typeId || relation.targetTypeId === typeId),
  );
  const selectKind = (kind: string) => {
    if (kind === "literal") onChange(zero);
    if (kind === "field" && fields[0]) onChange({ kind: "field", fieldId: fields[0].id });
    if (kind === "operation") onChange({ kind: "operation", operator: "add", arguments: [zero, zero] });
    if (kind === "optionAttribute" && fields.some((field) => field.valueType === "select")) {
      onChange({
        kind: "optionAttribute",
        fieldId: fields.find((field) => field.valueType === "select")?.id ?? "",
        attribute: "probability",
      });
    }
    if (kind === "related" && relations[0]) {
      onChange({
        kind: "related",
        relationId: relations[0].id,
        direction: relations[0].sourceTypeId === typeId ? "outgoing" : "incoming",
        reducer: "sum",
        expression: zero,
      });
    }
  };
  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <FormSelect
        id={`${path}.kind`}
        items={[
          { value: "literal", label: t("RecordModel.constant") },
          { value: "field", label: t("RecordModel.field"), disabled: !fields.length },
          {
            value: "related",
            label: t("RecordModel.linkedRecords"),
            disabled: !relations.length || depth >= 20,
          },
          { value: "operation", label: t("RecordModel.operation"), disabled: depth >= 20 },
          {
            value: "optionAttribute",
            label: t("RecordModel.optionProbability"),
            disabled: !fields.some((field) => field.valueType === "select"),
          },
        ]}
        label={t("RecordModel.calculationSource")}
        value={value.kind}
        onValueChange={selectKind}
      />

      {value.kind === "literal" && (
        <>
          <FormSelect
            id={`${path}.literalKind`}
            items={[
              { value: "decimal", label: t("RecordModel.types.number") },
              { value: "currency", label: t("RecordModel.types.currency") },
              { value: "text", label: t("RecordModel.types.text") },
              { value: "boolean", label: t("RecordModel.types.boolean") },
              { value: "missing", label: t("RecordModel.missing") },
            ]}
            label={t("RecordModel.valueType")}
            value={
              value.value?.kind === "decimal" && value.value.currency ? "currency" : (value.value?.kind ?? "missing")
            }
            onValueChange={(kind) => {
              const scalar: RecordScalar | null =
                kind === "missing"
                  ? null
                  : kind === "currency" || kind === "decimal"
                    ? {
                        kind: "decimal",
                        value: "0",
                        currency: kind === "currency" ? "EUR" : null,
                      }
                    : kind === "boolean"
                      ? { kind: "boolean", value: false }
                      : { kind: "text", value: "" };
              onChange({ kind: "literal", value: scalar });
            }}
          />

          {value.value && ["text", "decimal"].includes(value.value.kind) && (
            <Input
              aria-label={t("RecordModel.constant")}
              value={(value.value as { value: string }).value}
              onChange={(event) => {
                if (value.value?.kind === "text" || value.value?.kind === "decimal") {
                  onChange({
                    ...value,
                    value: { ...value.value, value: event.target.value },
                  });
                }
              }}
            />
          )}

          {value.value?.kind === "decimal" && value.value.currency && (
            <Input
              aria-label={t("RecordModel.currency")}
              maxLength={3}
              value={value.value.currency}
              onChange={(event) => {
                if (value.value?.kind === "decimal") {
                  onChange({
                    ...value,
                    value: {
                      ...value.value,
                      currency: event.target.value.toUpperCase(),
                    },
                  });
                }
              }}
            />
          )}

          {value.value?.kind === "boolean" && (
            <FormSelect
              id={`${path}.boolean`}
              items={[
                { value: "true", label: t("RecordModel.yes") },
                { value: "false", label: t("RecordModel.no") },
              ]}
              label={t("RecordModel.constant")}
              value={String(value.value.value)}
              onValueChange={(next) =>
                onChange({
                  ...value,
                  value: { kind: "boolean", value: next === "true" },
                })
              }
            />
          )}
        </>
      )}

      {(value.kind === "field" || value.kind === "optionAttribute") && (
        <FormSelect
          id={`${path}.fieldId`}
          items={fields
            .filter((field) => value.kind !== "optionAttribute" || field.valueType === "select")
            .map((field) => ({ value: field.id, label: field.label }))}
          label={t("RecordModel.field")}
          value={value.fieldId}
          onValueChange={(fieldId) => onChange({ ...value, fieldId })}
        />
      )}

      {value.kind === "related" && (
        <>
          <FormSelect
            id={`${path}.relationId`}
            items={relations.flatMap((relation) => [
              ...(relation.sourceTypeId === typeId
                ? [
                    {
                      value: `${relation.id}:outgoing`,
                      label: relation.sourceLabel,
                    },
                  ]
                : []),
              ...(relation.targetTypeId === typeId
                ? [
                    {
                      value: `${relation.id}:incoming`,
                      label: relation.targetLabel,
                    },
                  ]
                : []),
            ])}
            label={t("RecordModel.relationship")}
            value={`${value.relationId}:${value.direction}`}
            onValueChange={(key) => {
              const [relationId, direction] = key.split("RecordModel.:");
              onChange({
                ...value,
                relationId,
                direction: direction === "incoming" ? "incoming" : "outgoing",
                expression: zero,
              });
            }}
          />

          <FormSelect
            id={`${path}.reducer`}
            items={["one", "sum", "count", "average", "min", "max"].map((reducer) => ({
              value: reducer,
              label: t(`RecordModel.reducers.${reducer}`),
            }))}
            label={t("RecordModel.aggregation")}
            value={value.reducer}
            onValueChange={(reducer) => onChange({ ...value, reducer: reducer as typeof value.reducer })}
          />

          {value.reducer !== "count" && (
            <CalculationInput
              depth={depth + 1}
              model={model}
              path={`${path}.expression`}
              typeId={
                model.relationships.find((relation) => relation.id === value.relationId)?.[
                  value.direction === "outgoing" ? "targetTypeId" : "sourceTypeId"
                ] ?? typeId
              }
              value={value.expression}
              onChange={(expression) => onChange({ ...value, expression })}
            />
          )}
        </>
      )}

      {value.kind === "operation" && (
        <>
          <FormSelect
            id={`${path}.operator`}
            items={[
              "add",
              "subtract",
              "multiply",
              "divide",
              "equal",
              "lessThan",
              "greaterThan",
              "and",
              "or",
              "not",
              "if",
              "coalesce",
              "concat",
              "lower",
              "upper",
              "trim",
              "daysBetween",
            ].map((operator) => ({
              value: operator,
              label: t(`RecordModel.operators.${operator}`),
            }))}
            label={t("RecordModel.operation")}
            value={value.operator}
            onValueChange={(operator) => {
              const unary = ["not", "lower", "upper", "trim"].includes(operator);
              onChange({
                kind: "operation",
                operator: operator as typeof value.operator,
                arguments: Array.from(
                  { length: operator === "if" ? 3 : unary ? 1 : 2 },
                  (_, index) => value.arguments[index] ?? zero,
                ),
              });
            }}
          />

          {value.arguments.map((argument, index) => (
            <CalculationInput
              key={index}
              depth={depth + 1}
              model={model}
              path={`${path}.arguments.${index}`}
              typeId={typeId}
              value={argument}
              onChange={(next) =>
                onChange({
                  ...value,
                  arguments: value.arguments.map((old, position) => (position === index ? next : old)),
                })
              }
            />
          ))}

          {["concat", "coalesce", "and", "or"].includes(value.operator) && value.arguments.length < 32 && (
            <Button
              size="sm"
              type="button"
              variant="secondary"
              onClick={() => onChange({ ...value, arguments: [...value.arguments, zero] })}
            >
              {t("RecordModel.addInput")}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
