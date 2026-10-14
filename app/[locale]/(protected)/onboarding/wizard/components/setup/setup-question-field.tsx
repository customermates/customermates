"use client";

import type { SetupAnswerValue } from "@/features/workspace-setup/setup-answers.schema";
import type { SetupQuestionDescriptor } from "./setup-question-descriptor";

import { ArrowDown, ArrowUp, Globe, Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { FormAutocompleteCountry } from "@/components/forms/form-autocomplete-country";
import { FormAutocompleteCurrency } from "@/components/forms/form-autocomplete-currency";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { APP_LOCALES } from "@/i18n/locale-registry";

import { SETUP_CHIP_CLASS, SetupChip, SetupCustomEntry, SetupRemovableChip } from "./setup-choice-chips";

type FieldProps<F extends SetupQuestionDescriptor["format"]> = {
  descriptor: Extract<SetupQuestionDescriptor, { format: F }>;
  value: Extract<SetupAnswerValue, { format: F }> | null;
  onChange: (value: Extract<SetupAnswerValue, { format: F }>) => void;
  disabled?: boolean;
};

function SingleChoiceField({ descriptor, value, onChange, disabled }: FieldProps<"singleChoice">) {
  const t = useTranslations();
  const select = (id: string) => onChange({ format: "singleChoice", value: id });

  if (descriptor.optionSource === "countries") {
    return (
      <FormAutocompleteCountry
        ariaLabel={descriptor.label}
        disabled={disabled}
        id={`setup-${descriptor.id}`}
        label={null}
        value={value?.value.toLowerCase()}
        onValueChange={(next) => {
          if (typeof next === "string" && next) select(next.toUpperCase());
        }}
      />
    );
  }

  if (descriptor.optionSource === "currencies") {
    return (
      <FormAutocompleteCurrency
        ariaLabel={descriptor.label}
        disabled={disabled}
        id={`setup-${descriptor.id}`}
        label={null}
        value={value?.value.toLowerCase()}
        onValueChange={(next) => {
          if (typeof next === "string" && next) select(next.toUpperCase());
        }}
      />
    );
  }

  const options =
    descriptor.optionSource === "locales"
      ? APP_LOCALES.map((locale) => ({ id: locale, label: t(`Common.locales.${locale}`) }))
      : descriptor.options;

  return (
    <div aria-label={descriptor.label} className="flex flex-wrap gap-2" role="radiogroup">
      {options.map((option) => (
        <SetupChip
          key={option.id}
          disabled={disabled}
          pressed={value?.value === option.id}
          role="radio"
          onPressedChange={() => select(option.id)}
        >
          {option.label}
        </SetupChip>
      ))}
    </div>
  );
}

function MultipleChoiceField({ descriptor, value, onChange, disabled }: FieldProps<"multipleChoice">) {
  const values = value?.values ?? [];
  const custom = value?.custom ?? [];
  const update = (next: { values?: string[]; custom?: string[] }) =>
    onChange({ format: "multipleChoice", values: next.values ?? values, custom: next.custom ?? custom });

  return (
    <div aria-label={descriptor.label} className="flex flex-wrap items-center gap-2" role="group">
      {descriptor.options.map((option) => (
        <SetupChip
          key={option.id}
          disabled={disabled}
          pressed={values.includes(option.id)}
          role="checkbox"
          onPressedChange={(pressed) =>
            update({ values: pressed ? [...values, option.id] : values.filter((id) => id !== option.id) })
          }
        >
          {option.label}
        </SetupChip>
      ))}

      {custom.map((entry) => (
        <SetupRemovableChip
          key={entry}
          disabled={disabled}
          label={entry}
          onRemove={() => update({ custom: custom.filter((candidate) => candidate !== entry) })}
        />
      ))}

      {descriptor.allowCustom && custom.length < 10 ? (
        <SetupCustomEntry
          disabled={disabled}
          onAdd={(entry) => {
            if (!custom.some((candidate) => candidate.toLowerCase() === entry.toLowerCase()))
              update({ custom: [...custom, entry] });
          }}
        />
      ) : null}
    </div>
  );
}

function OrderedListField({ descriptor, value, onChange, disabled }: FieldProps<"orderedList">) {
  const t = useTranslations();
  const items = value?.items ?? [];
  const update = (next: typeof items) => onChange({ format: "orderedList", items: next });
  const move = (index: number, offset: number) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + offset, 0, item);
    update(next);
  };

  return (
    <div className="flex flex-col gap-2">
      {descriptor.winChance && items.length > 0 ? (
        <div aria-hidden className="flex justify-end pr-[5.75rem] text-xs text-muted-foreground">
          <span className="w-20 text-right">{t("WorkspaceSetup.actions.winChance")}</span>
        </div>
      ) : null}

      <ol aria-label={descriptor.label} className="flex flex-col gap-1.5">
        {items.map((item, index) => (
          <li key={index} className="flex animate-page-result-in items-center gap-2 motion-reduce:animate-none">
            <span aria-hidden className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
              {index + 1}
            </span>

            <Input
              aria-label={t("WorkspaceSetup.interview.entryLabel", { index: index + 1 })}
              className="h-8 min-w-0 flex-1"
              disabled={disabled}
              maxLength={80}
              value={item.label}
              onChange={(event) =>
                update(items.map((entry, at) => (at === index ? { ...entry, label: event.target.value } : entry)))
              }
            />

            {descriptor.winChance ? (
              <div className="relative w-20 shrink-0">
                <Input
                  aria-label={t("WorkspaceSetup.interview.winChanceFor", { index: index + 1 })}
                  className="h-8 pr-6 text-right"
                  disabled={disabled}
                  inputMode="numeric"
                  max={100}
                  min={0}
                  type="number"
                  value={item.winChance ?? ""}
                  onChange={(event) => {
                    const raw = event.target.value;
                    const parsed = Math.round(Number(raw));
                    const winChance =
                      raw === "" || Number.isNaN(parsed) ? undefined : Math.min(100, Math.max(0, parsed));
                    update(items.map((entry, at) => (at === index ? { label: entry.label, winChance } : entry)));
                  }}
                />

                <span
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted-foreground"
                >
                  %
                </span>
              </div>
            ) : null}

            <div className="flex shrink-0 items-center">
              <IconButton
                fieldAction
                className="size-7"
                disabled={disabled || index === 0}
                icon={ArrowUp}
                label={t("WorkspaceSetup.interview.moveUp")}
                onClick={() => move(index, -1)}
              />

              <IconButton
                fieldAction
                className="size-7"
                disabled={disabled || index === items.length - 1}
                icon={ArrowDown}
                label={t("WorkspaceSetup.interview.moveDown")}
                onClick={() => move(index, 1)}
              />

              <IconButton
                fieldAction
                className="size-7"
                disabled={disabled}
                icon={X}
                label={t("Common.actions.remove")}
                onClick={() => update(items.filter((_, at) => at !== index))}
              />
            </div>
          </li>
        ))}
      </ol>

      <Button
        className="self-start"
        disabled={disabled || items.length >= descriptor.maxItems}
        size="sm"
        type="button"
        variant="ghost"
        onClick={() => update([...items, { label: "" }])}
      >
        <Plus />

        {t("WorkspaceSetup.interview.addEntry")}
      </Button>
    </div>
  );
}

function RankedPickField({ descriptor, value, onChange, disabled }: FieldProps<"rankedPick">) {
  const t = useTranslations();
  const picks = value?.values ?? [];
  const full = picks.length >= descriptor.maxPicks;

  return (
    <div className="flex flex-col gap-2">
      <div aria-label={descriptor.label} className="flex flex-wrap gap-2" role="group">
        {descriptor.options.map((option) => {
          const rank = picks.indexOf(option.id);
          const picked = rank !== -1;
          return (
            <Toggle
              key={option.id}
              aria-label={
                picked ? t("WorkspaceSetup.interview.rankedOption", { rank: rank + 1, label: option.label }) : undefined
              }
              className={SETUP_CHIP_CLASS}
              disabled={disabled || (full && !picked)}
              pressed={picked}
              size="sm"
              variant="outline"
              onPressedChange={(pressed) => {
                const next = pressed ? [...picks, option.id] : picks.filter((id) => id !== option.id);
                onChange({ format: "rankedPick", values: next });
              }}
            >
              {picked ? (
                <span
                  aria-hidden
                  className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground"
                >
                  {rank + 1}
                </span>
              ) : null}

              {option.label}
            </Toggle>
          );
        })}
      </div>

      <p aria-live="polite" className="text-xs text-muted-foreground">
        {t("WorkspaceSetup.interview.rankedHint", { count: picks.length, max: descriptor.maxPicks })}
      </p>
    </div>
  );
}

function numberText(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function RangeField({
  descriptor,
  value,
  onChange,
  disabled,
  currency,
}: FieldProps<"range"> & { currency: string | null }) {
  const t = useTranslations();
  const [minText, setMinText] = useState(numberText(value?.min));
  const [maxText, setMaxText] = useState(numberText(value?.max));
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    if (value && Number(minText) !== value.min) setMinText(numberText(value.min));
    if (value && (maxText === "" ? null : Number(maxText)) !== value.max) setMaxText(numberText(value.max));
  }
  const clamp = (raw: number) => Math.min(descriptor.max, Math.max(descriptor.min, raw));
  const commit = (nextMin: string, nextMax: string) => {
    if (nextMin.trim() === "" || Number.isNaN(Number(nextMin))) return;
    const min = clamp(Number(nextMin));
    const max =
      descriptor.single || nextMax.trim() === "" || Number.isNaN(Number(nextMax)) ? null : clamp(Number(nextMax));
    onChange({ format: "range", min, max: max !== null && max < min ? min : max });
  };
  const unit = descriptor.unit === "currency" ? (currency?.toUpperCase() ?? "") : t("WorkspaceSetup.interview.days");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        aria-label={descriptor.single ? descriptor.label : t("WorkspaceSetup.interview.rangeFrom")}
        className="w-32"
        disabled={disabled}
        inputMode="decimal"
        max={descriptor.max}
        min={descriptor.min}
        type="number"
        value={minText}
        onChange={(event) => {
          setMinText(event.target.value);
          commit(event.target.value, maxText);
        }}
      />

      {descriptor.single ? null : (
        <>
          <span aria-hidden className="text-muted-foreground">
            –
          </span>

          <Input
            aria-label={t("WorkspaceSetup.interview.rangeTo")}
            className="w-32"
            disabled={disabled}
            inputMode="decimal"
            max={descriptor.max}
            min={descriptor.min}
            type="number"
            value={maxText}
            onChange={(event) => {
              setMaxText(event.target.value);
              commit(minText, event.target.value);
            }}
          />
        </>
      )}

      {unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null}
    </div>
  );
}

function ShortTextField({ descriptor, value, onChange, disabled }: FieldProps<"shortText">) {
  const t = useTranslations();
  const props = {
    "aria-label": descriptor.label,
    disabled,
    maxLength: descriptor.maxLength,
    placeholder: descriptor.optional ? t("WorkspaceSetup.interview.optionalPlaceholder") : undefined,
    value: value?.value ?? "",
  };
  return descriptor.maxLength > 200 ? (
    <Textarea {...props} rows={3} onChange={(event) => onChange({ format: "shortText", value: event.target.value })} />
  ) : (
    <Input {...props} onChange={(event) => onChange({ format: "shortText", value: event.target.value })} />
  );
}

type Props = {
  descriptor: SetupQuestionDescriptor;
  value: SetupAnswerValue | null;
  onChange: (value: SetupAnswerValue) => void;
  disabled?: boolean;
  fromWebsite?: boolean;
  currency?: string | null;
};

function FieldBody({ descriptor, value, onChange, disabled, currency }: Omit<Props, "fromWebsite">) {
  switch (descriptor.format) {
    case "singleChoice":
      return (
        <SingleChoiceField
          descriptor={descriptor}
          disabled={disabled}
          value={value?.format === "singleChoice" ? value : null}
          onChange={onChange}
        />
      );
    case "multipleChoice":
      return (
        <MultipleChoiceField
          descriptor={descriptor}
          disabled={disabled}
          value={value?.format === "multipleChoice" ? value : null}
          onChange={onChange}
        />
      );
    case "orderedList":
      return (
        <OrderedListField
          descriptor={descriptor}
          disabled={disabled}
          value={value?.format === "orderedList" ? value : null}
          onChange={onChange}
        />
      );
    case "rankedPick":
      return (
        <RankedPickField
          descriptor={descriptor}
          disabled={disabled}
          value={value?.format === "rankedPick" ? value : null}
          onChange={onChange}
        />
      );
    case "range":
      return (
        <RangeField
          currency={currency ?? null}
          descriptor={descriptor}
          disabled={disabled}
          value={value?.format === "range" ? value : null}
          onChange={onChange}
        />
      );
    case "shortText":
      return (
        <ShortTextField
          descriptor={descriptor}
          disabled={disabled}
          value={value?.format === "shortText" ? value : null}
          onChange={onChange}
        />
      );
  }
}

export function SetupQuestionField({ descriptor, fromWebsite = false, ...props }: Props) {
  const t = useTranslations();
  const labelId = `setup-question-${descriptor.id}`;
  return (
    <div aria-labelledby={labelId} className="flex flex-col gap-2.5" role="group">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium" id={labelId}>
          {descriptor.label}
        </span>

        {descriptor.optional ? (
          <span className="text-xs text-muted-foreground">{t("WorkspaceSetup.interview.optional")}</span>
        ) : null}

        {fromWebsite ? (
          <AppChip
            className="animate-page-result-in motion-reduce:animate-none"
            startContent={<Globe aria-hidden />}
            variant="info"
          >
            {t("WorkspaceSetup.actions.fromWebsite")}
          </AppChip>
        ) : null}
      </div>

      <FieldBody descriptor={descriptor} {...props} />
    </div>
  );
}
