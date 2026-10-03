"use client";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { ChevronRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import type { CalculationExpression, RecordModel, RecordScalar } from "@/features/records/record-model.schema";
import { useAppForm } from "@/components/forms/form-context";
import { FormSelect } from "@/components/forms/form-select";
import { FormLabel } from "@/components/forms/form-label";
import { FormAutocompleteCurrency } from "@/components/forms/form-autocomplete-currency";
import { FormAutocompleteAvatar } from "@/components/forms/form-autocomplete-avatar";
import { FormIsoDatePicker } from "@/components/forms/form-iso-date-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { getUsersAction } from "../../actions";
import {
  expressionAt,
  expressionTypeId,
  expressionSummary,
  replaceExpression,
  type ExpressionPath,
} from "./calculation-editor";

const Editor = dynamic(() => import("@/components/editor/editor").then((module) => module.Editor), { ssr: false });
const zero: CalculationExpression = { kind: "literal", value: { kind: "decimal", value: "0", currency: null } };
const variadic = ["concat", "coalesce", "and", "or"];

export const CalculationInput = observer(function CalculationInput({
  model,
  typeId,
  value,
  onChange,
  path = "expression",
  behavior,
  literalOnly = false,
}: {
  model: RecordModel;
  typeId: string;
  value: CalculationExpression;
  onChange: (value: CalculationExpression) => void;
  path?: string;
  behavior?: "input" | "formula" | "lookup" | "rollup" | "snapshot";
  literalOnly?: boolean;
}) {
  const t = useTranslations();
  const form = useAppForm();
  const disabled = form?.isDisabled ?? false;
  const [selection, setSelection] = useState<ExpressionPath>([]);
  const selected = expressionAt(value, selection);
  const activePath = selected ? selection : [];
  const current = selected ?? value;
  const currentTypeId = expressionTypeId(value, activePath, typeId, model);
  const id = `${path}${activePath.map((step) => (step === "expression" ? ".expression" : `.arguments.${step}`)).join("")}`;
  const fields = model.fields.filter((field) => field.typeId === currentTypeId && !field.archived);
  const relations = model.relationships.filter(
    (relation) =>
      !relation.archived && (relation.sourceTypeId === currentTypeId || relation.targetTypeId === currentTypeId),
  );
  const summary = (expression: CalculationExpression) =>
    expressionSummary(expression, model, (key) => t(`RecordModel.${key}`));
  const commit = (replacement: CalculationExpression) => {
    if (!disabled) onChange(replaceExpression(value, activePath, replacement));
  };
  const textControl = (
    suffix: string,
    label: string,
    input: string,
    update: (next: string) => void,
    multiline = false,
  ) => (
    <div className="space-y-1.5">
      <FormLabel htmlFor={`${id}.${suffix}`}>{label}</FormLabel>

      {multiline ? (
        <Textarea
          disabled={disabled}
          id={`${id}.${suffix}`}
          value={input}
          onChange={(event) => {
            if (!disabled) update(event.target.value);
          }}
        />
      ) : (
        <Input
          disabled={disabled}
          id={`${id}.${suffix}`}
          value={input}
          onChange={(event) => {
            if (!disabled) update(event.target.value);
          }}
        />
      )}
    </div>
  );
  const selectKind = (kind: string) => {
    if (kind === "literal") commit(zero);
    if (kind === "field" && fields[0]) commit({ kind: "field", fieldId: fields[0].id });
    if (kind === "operation") commit({ kind: "operation", operator: "add", arguments: [zero, zero] });
    if (kind === "optionAttribute") {
      const field = fields.find((field) => field.valueType === "select");
      if (field) commit({ kind: "optionAttribute", fieldId: field.id, attribute: "probability" });
    }
    if (kind === "related" && relations[0]) {
      commit({
        kind: "related",
        relationId: relations[0].id,
        direction: relations[0].sourceTypeId === currentTypeId ? "outgoing" : "incoming",
        reducer: "sum",
        expression: zero,
      });
    }
  };
  const literalValue = (kind: string): RecordScalar | null => {
    if (kind === "missing") return null;
    if (kind === "currency" || kind === "decimal")
      return { kind: "decimal", value: "0", currency: kind === "currency" ? "EUR" : null };
    if (kind === "boolean") return { kind, value: false };
    if (kind === "date" || kind === "dateTime")
      return { kind, value: kind === "date" ? new Date().toISOString().slice(0, 10) : new Date().toISOString() };
    if (kind === "range") return { kind, start: null, end: null };
    if (kind === "textList") return { kind, value: [""] };
    if (kind === "richText")
      return { kind, documentJson: JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }) };
    if (kind === "select") return { kind, value: fields.flatMap((field) => field.options)[0]?.id ?? "" };
    if (kind === "member") return { kind, value: "" };
    return { kind: "text", value: "" };
  };
  const child = (expression: CalculationExpression, step: number | "expression", label: string) => (
    <div className="flex items-center gap-2">
      <Button
        className="h-auto min-h-9 flex-1 justify-between gap-3 text-left font-normal"
        disabled={disabled}
        type="button"
        variant="field"
        onClick={() => setSelection([...activePath, step])}
      >
        <span className="min-w-0">
          <span className="block text-xs text-muted-foreground">{label}</span>

          <span className="block truncate">{summary(expression)}</span>
        </span>

        <ChevronRight aria-hidden className="size-4 shrink-0" />
      </Button>

      {current.kind === "operation" &&
        typeof step === "number" &&
        variadic.includes(current.operator) &&
        current.arguments.length > 1 && (
          <Button
            aria-label={t("RecordModel.removeInput")}
            disabled={disabled}
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => commit({ ...current, arguments: current.arguments.filter((_, index) => index !== step) })}
          >
            <X aria-hidden className="size-4" />
          </Button>
        )}
    </div>
  );
  return (
    <section aria-label={t("RecordModel.operation")} className="min-w-0 space-y-4" data-calculation-editor="linear">
      <p className="break-words text-sm text-muted-foreground">{summary(value)}</p>

      {activePath.length > 0 && (
        <div aria-label={t("RecordModel.calculationNavigation")} className="flex flex-wrap items-center gap-1">
          <Button disabled={disabled} size="sm" type="button" variant="ghost" onClick={() => setSelection([])}>
            {t("RecordModel.calculationResult")}
          </Button>

          {activePath.map((step, index) => (
            <Button
              key={index}
              disabled={disabled}
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => setSelection(activePath.slice(0, index + 1))}
            >
              <ChevronRight aria-hidden className="size-3" />

              {step === "expression" ? t("RecordModel.value") : t("RecordModel.calculationInput", { number: step + 1 })}
            </Button>
          ))}
        </div>
      )}

      {!literalOnly &&
        !(activePath.length === 0 && ["lookup", "rollup"].includes(behavior ?? "") && current.kind === "related") && (
          <FormSelect
            disabled={disabled}
            id={`${id}.kind`}
            items={[
              { value: "literal", label: t("RecordModel.constant") },
              { value: "field", label: t("RecordModel.field"), disabled: !fields.length },
              {
                value: "related",
                label: t("RecordModel.linkedRecords"),
                disabled: !relations.length || activePath.length >= 20,
              },
              { value: "operation", label: t("RecordModel.operation"), disabled: activePath.length >= 20 },
              {
                value: "optionAttribute",
                label: t("RecordModel.optionAttribute"),
                disabled: !fields.some((field) => field.valueType === "select"),
              },
            ]}
            label={t("RecordModel.calculationSource")}
            value={current.kind}
            onValueChange={selectKind}
          />
        )}

      {current.kind === "literal" && (
        <>
          <FormSelect
            disabled={disabled}
            id={`${id}.literalKind`}
            items={[
              ["decimal", "types.number"],
              ["currency", "types.currency"],
              ["text", "types.text"],
              ["textList", "multipleValues"],
              ["boolean", "types.boolean"],
              ["date", "types.date"],
              ["dateTime", "types.dateTime"],
              ["range", "types.dateTimeRange"],
              ["select", "types.select"],
              ["member", "types.member"],
              ["richText", "types.richText"],
              ["missing", "missing"],
            ].map(([kind, key]) => ({
              value: kind,
              label: t(`RecordModel.${key}`),
              disabled: literalOnly && kind === "missing",
            }))}
            label={t("RecordModel.valueType")}
            value={
              current.value?.kind === "decimal" && current.value.currency
                ? "currency"
                : (current.value?.kind ?? "missing")
            }
            onValueChange={(kind) => commit({ kind: "literal", value: literalValue(kind) })}
          />

          {current.value &&
            (current.value.kind === "text" || current.value.kind === "decimal") &&
            textControl("value.value", t("RecordModel.constant"), current.value.value, (next) => {
              if (current.value?.kind === "text" || current.value?.kind === "decimal")
                commit({ ...current, value: { ...current.value, value: next } });
            })}

          {current.value?.kind === "decimal" && current.value.currency && (
            <FormAutocompleteCurrency
              disabled={disabled}
              id={`${id}.value.currency`}
              label={t("RecordModel.currency")}
              value={current.value.currency.toLowerCase()}
              onValueChange={(currency) => {
                if (typeof currency === "string" && current.value?.kind === "decimal")
                  commit({ ...current, value: { ...current.value, currency: currency.toUpperCase() } });
              }}
            />
          )}

          {current.value?.kind === "boolean" && (
            <FormSelect
              disabled={disabled}
              id={`${id}.value.value`}
              items={[
                { value: "true", label: t("RecordModel.yes") },
                { value: "false", label: t("RecordModel.no") },
              ]}
              label={t("RecordModel.constant")}
              value={String(current.value.value)}
              onValueChange={(next) => commit({ ...current, value: { kind: "boolean", value: next === "true" } })}
            />
          )}

          {current.value && (current.value.kind === "date" || current.value.kind === "dateTime") && (
            <FormIsoDatePicker
              dateOnly={current.value.kind === "date"}
              id={`${id}.value.value`}
              label={t("RecordModel.constant")}
              value={current.value.value}
              onValueChange={(next) => {
                if (current.value?.kind === "date" || current.value?.kind === "dateTime")
                  commit({ ...current, value: next ? { ...current.value, value: next } : null });
              }}
            />
          )}

          {current.value?.kind === "range" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {(["start", "end"] as const).map((end) => (
                <FormIsoDatePicker
                  key={end}
                  dateOnly={false}
                  id={`${id}.value.${end}`}
                  label={t(`RecordModel.range${end === "start" ? "Start" : "End"}`)}
                  value={current.value?.kind === "range" ? (current.value[end] ?? "") : ""}
                  onValueChange={(next) => {
                    if (current.value?.kind === "range")
                      commit({ ...current, value: { ...current.value, [end]: next ?? null } });
                  }}
                />
              ))}
            </div>
          )}

          {current.value?.kind === "textList" &&
            textControl(
              "value.value",
              t("RecordModel.constant"),
              current.value.value.join("\n"),
              (next) => commit({ ...current, value: { kind: "textList", value: next.split("\n") } }),
              true,
            )}

          {current.value?.kind === "select" && (
            <FormSelect
              disabled={disabled}
              id={`${id}.value.value`}
              items={fields.flatMap((field) =>
                field.options.map((option) => ({ value: option.id, label: `${field.label} · ${option.label}` })),
              )}
              label={t("RecordModel.option")}
              value={current.value.value}
              onValueChange={(next) => commit({ ...current, value: { kind: "select", value: next } })}
            />
          )}

          {current.value?.kind === "member" && (
            <FormAutocompleteAvatar
              disabled={disabled}
              getItems={getUsersAction}
              id={`${id}.value.value`}
              label={t("RecordModel.member")}
              value={current.value.value}
              onValueChange={(next) => {
                if (typeof next === "string") commit({ ...current, value: { kind: "member", value: next } });
              }}
            />
          )}

          {current.value?.kind === "richText" && (
            <Editor
              data={JSON.parse(current.value.documentJson)}
              label={t("RecordModel.constant")}
              readOnly={disabled}
              onChange={(document) =>
                commit({ ...current, value: { kind: "richText", documentJson: JSON.stringify(document) } })
              }
            />
          )}
        </>
      )}

      {(current.kind === "field" || current.kind === "optionAttribute") && (
        <FormSelect
          disabled={disabled}
          id={`${id}.fieldId`}
          items={fields
            .filter((field) => current.kind !== "optionAttribute" || field.valueType === "select")
            .map((field) => ({ value: field.id, label: field.label }))}
          label={t("RecordModel.field")}
          value={current.fieldId}
          onValueChange={(fieldId) => commit({ ...current, fieldId })}
        />
      )}

      {current.kind === "optionAttribute" &&
        textControl("attribute", t("RecordModel.attribute"), current.attribute, (attribute) =>
          commit({ ...current, attribute }),
        )}

      {current.kind === "related" && (
        <>
          <FormSelect
            disabled={disabled}
            id={`${id}.relationId`}
            items={relations.flatMap((relation) => [
              ...(relation.sourceTypeId === currentTypeId
                ? [{ value: `${relation.id}:outgoing`, label: relation.sourceLabel }]
                : []),
              ...(relation.targetTypeId === currentTypeId
                ? [{ value: `${relation.id}:incoming`, label: relation.targetLabel }]
                : []),
            ])}
            label={t("RecordModel.relationship")}
            value={`${current.relationId}:${current.direction}`}
            onValueChange={(key) => {
              const [relationId, direction] = key.split(":");
              if (direction === "incoming" || direction === "outgoing") {
                const relation = relations.find((relation) => relation.id === relationId);
                const targetId = direction === "incoming" ? relation?.sourceTypeId : relation?.targetTypeId;
                const field =
                  model.fields.find(
                    (field) =>
                      field.typeId === targetId && !field.archived && ["number", "currency"].includes(field.valueType),
                  ) ?? model.fields.find((field) => field.typeId === targetId && !field.archived);
                commit({
                  ...current,
                  relationId,
                  direction,
                  expression: field ? { kind: "field", fieldId: field.id } : zero,
                });
              }
            }}
          />

          {behavior !== "lookup" || activePath.length !== 0 ? (
            <FormSelect
              disabled={disabled}
              id={`${id}.reducer`}
              items={["one", "sum", "count", "average", "min", "max"].map((reducer) => ({
                value: reducer,
                label: t(`RecordModel.reducers.${reducer}`),
              }))}
              label={t("RecordModel.aggregation")}
              value={current.reducer}
              onValueChange={(reducer) => commit({ ...current, reducer: reducer as typeof current.reducer })}
            />
          ) : null}

          {current.reducer !== "count" &&
            (current.expression.kind === "field" ? (
              <div className="flex items-end gap-2">
                <FormSelect
                  containerClassName="min-w-0 flex-1"
                  disabled={disabled}
                  id={`${id}.expression.fieldId`}
                  items={model.fields
                    .filter(
                      (field) =>
                        !field.archived &&
                        field.typeId === expressionTypeId(value, [...activePath, "expression"], typeId, model),
                    )
                    .map((field) => ({ value: field.id, label: field.label }))}
                  label={t("RecordModel.value")}
                  value={current.expression.fieldId}
                  onValueChange={(fieldId) => commit({ ...current, expression: { kind: "field", fieldId } })}
                />

                <Button
                  disabled={disabled}
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => setSelection([...activePath, "expression"])}
                >
                  {t("RecordModel.edit")}
                </Button>
              </div>
            ) : (
              child(current.expression, "expression", t("RecordModel.value"))
            ))}
        </>
      )}

      {current.kind === "operation" && (
        <>
          <FormSelect
            disabled={disabled}
            id={`${id}.operator`}
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
            ].map((operator) => ({ value: operator, label: t(`RecordModel.operators.${operator}`) }))}
            label={t("RecordModel.operation")}
            value={current.operator}
            onValueChange={(operator) => {
              const length = operator === "if" ? 3 : ["not", "lower", "upper", "trim"].includes(operator) ? 1 : 2;
              commit({
                kind: "operation",
                operator: operator as typeof current.operator,
                arguments: Array.from({ length }, (_, index) => current.arguments[index] ?? zero),
              });
            }}
          />

          <div className="space-y-2">
            {current.arguments.map((argument, index) => (
              <div key={index}>
                {child(
                  argument,
                  index,
                  current.operator === "if"
                    ? t(`RecordModel.condition${index === 0 ? "If" : index === 1 ? "Then" : "Otherwise"}`)
                    : t("RecordModel.calculationInput", { number: index + 1 }),
                )}
              </div>
            ))}
          </div>

          {variadic.includes(current.operator) && current.arguments.length < 32 && (
            <Button
              disabled={disabled}
              size="sm"
              type="button"
              variant="secondary"
              onClick={() => commit({ ...current, arguments: [...current.arguments, zero] })}
            >
              {t("RecordModel.addInput")}
            </Button>
          )}
        </>
      )}
    </section>
  );
});
