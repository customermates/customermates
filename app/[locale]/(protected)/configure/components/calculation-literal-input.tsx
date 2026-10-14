"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import type { RecordModelView, RecordScalar } from "@/features/records/record-model.schema";
import { useAppForm } from "@/components/forms/form-context";
import { FormSelect } from "@/components/forms/form-select";
import { FormLabel } from "@/components/forms/form-label";
import { FormAutocompleteCurrency } from "@/components/forms/form-autocomplete-currency";
import { FormAutocompleteAvatar } from "@/components/forms/form-autocomplete-avatar";
import { FormIsoDatePicker } from "@/components/forms/form-iso-date-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toLocalIso } from "@/components/forms/iso-date-values";
import { toChipColor } from "@/constants/chip-colors";
import { getUsersAction } from "@/app/[locale]/(protected)/settings/(workspace)/actions";

const Editor = dynamic(() => import("@/components/editor/editor").then((module) => module.Editor), { ssr: false });

export const CalculationLiteralInput = observer(function CalculationLiteralInput({
  model,
  typeId,
  value,
  onChange,
  id,
  currency,
}: {
  model: RecordModelView;
  typeId: string;
  value: RecordScalar | null;
  onChange: (value: RecordScalar | null) => void;
  id: string;
  currency: string;
}) {
  const t = useTranslations();
  const form = useAppForm();
  const disabled = form?.isDisabled ?? false;
  const fields = model.fields.filter((field) => field.typeId === typeId && !field.archived);
  const commit = (next: RecordScalar | null) => {
    if (!disabled) onChange(next);
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
  const literalValue = (kind: string): RecordScalar | null => {
    if (kind === "currency" || kind === "decimal") {
      return {
        kind: "decimal",
        value: "0",
        currency: kind === "currency" ? currency.toUpperCase() : null,
      };
    }
    if (kind === "boolean") return { kind, value: false };
    if (kind === "date" || kind === "dateTime") return { kind, value: toLocalIso(new Date(), kind === "date") };
    if (kind === "range") return { kind, start: null, end: null };
    if (kind === "textList") return { kind, value: [""] };
    if (kind === "richText")
      return { kind, documentJson: JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }) };
    if (kind === "select") return { kind, value: fields.flatMap((field) => field.options)[0]?.id ?? "" };
    if (kind === "member") return { kind, value: "" };
    return { kind: "text", value: "" };
  };
  return (
    <section aria-label={t("RecordModel.constant")} className="min-w-0 space-y-4">
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
        ].map(([kind, key]) => ({
          value: kind,
          label: t(`RecordModel.${key}`),
        }))}
        label={t("RecordModel.valueType")}
        value={value?.kind === "decimal" && value.currency ? "currency" : value?.kind}
        onValueChange={(kind) => commit(literalValue(kind))}
      />

      {value &&
        (value.kind === "text" || value.kind === "decimal") &&
        textControl("value.value", t("RecordModel.constant"), value.value, (next) => {
          if (value?.kind === "text" || value?.kind === "decimal") commit({ ...value, value: next });
        })}

      {value?.kind === "decimal" && value.currency && (
        <FormAutocompleteCurrency
          disabled={disabled}
          id={`${id}.value.currency`}
          label={t("RecordModel.currency")}
          value={value.currency.toLowerCase()}
          onValueChange={(currency) => {
            if (typeof currency === "string" && value?.kind === "decimal")
              commit({ ...value, currency: currency.toUpperCase() });
          }}
        />
      )}

      {value?.kind === "boolean" && (
        <FormSelect
          disabled={disabled}
          id={`${id}.value.value`}
          items={[
            { value: "true", label: t("RecordModel.yes") },
            { value: "false", label: t("RecordModel.no") },
          ]}
          label={t("RecordModel.constant")}
          value={String(value.value)}
          onValueChange={(next) => commit({ kind: "boolean", value: next === "true" })}
        />
      )}

      {value && (value.kind === "date" || value.kind === "dateTime") && (
        <FormIsoDatePicker
          dateOnly={value.kind === "date"}
          id={`${id}.value.value`}
          label={t("RecordModel.constant")}
          value={value.value}
          onValueChange={(next) => {
            if (value?.kind === "date" || value?.kind === "dateTime") commit(next ? { ...value, value: next } : null);
          }}
        />
      )}

      {value?.kind === "range" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {(["start", "end"] as const).map((end) => (
            <FormIsoDatePicker
              key={end}
              dateOnly={false}
              id={`${id}.value.${end}`}
              label={t(`RecordModel.range${end === "start" ? "Start" : "End"}`)}
              value={value?.kind === "range" ? (value[end] ?? "") : ""}
              onValueChange={(next) => {
                if (value?.kind === "range") commit({ ...value, [end]: next ?? null });
              }}
            />
          ))}
        </div>
      )}

      {value?.kind === "textList" &&
        textControl(
          "value.value",
          t("RecordModel.constant"),
          value.value.join("\n"),
          (next) => commit({ kind: "textList", value: next.split("\n") }),
          true,
        )}

      {value?.kind === "select" && (
        <FormSelect
          disabled={disabled}
          id={`${id}.value.value`}
          items={fields.flatMap((field) =>
            field.options.map((option) => ({
              value: option.id,
              label: option.label,
              color: toChipColor(option.color),
              description: field.label,
            })),
          )}
          label={t("RecordModel.option")}
          value={value.value}
          onValueChange={(next) => commit({ kind: "select", value: next })}
        />
      )}

      {value?.kind === "member" && (
        <FormAutocompleteAvatar
          disabled={disabled}
          getItems={getUsersAction}
          id={`${id}.value.value`}
          label={t("RecordModel.member")}
          value={value.value}
          onValueChange={(next) => {
            if (typeof next === "string") commit({ kind: "member", value: next });
          }}
        />
      )}

      {value?.kind === "richText" && (
        <Editor
          data={JSON.parse(value.documentJson)}
          label={t("RecordModel.constant")}
          readOnly={disabled}
          onChange={(document) => commit({ kind: "richText", documentJson: JSON.stringify(document) })}
        />
      )}
    </section>
  );
});
