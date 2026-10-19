"use client";

import type { SetupAnswerValue } from "@/features/workspace-setup/setup-answers.schema";
import type { SetupQuestionDescriptor } from "./setup-question-descriptor";

import { ArrowDown, ArrowUp, Plus, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { FormAutocompleteCountry } from "@/components/forms/form-autocomplete-country";
import { FormAutocompleteCurrency } from "@/components/forms/form-autocomplete-currency";
import { FormControlRow } from "@/components/forms/form-control-row";
import { FormLabel } from "@/components/forms/form-label";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getCurrencyLabel } from "@/constants/currencies";
import { cn } from "@/core/utils/cn";
import { APP_LOCALES } from "@/i18n/locale-registry";

import {
  SETUP_CHIP_CLASS,
  SetupCheckChip,
  SetupChoiceGroup,
  SetupCustomEntry,
  SetupRadioChip,
} from "./setup-choice-chips";

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
    <SetupChoiceGroup disabled={disabled} label={descriptor.label} value={value?.value ?? null} onValueChange={select}>
      {options.map((option) => (
        <SetupRadioChip key={option.id} checked={value?.value === option.id} value={option.id}>
          {option.label}
        </SetupRadioChip>
      ))}
    </SetupChoiceGroup>
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
        <SetupCheckChip
          key={option.id}
          checked={values.includes(option.id)}
          disabled={disabled}
          onCheckedChange={(checked) =>
            update({ values: checked ? [...values, option.id] : values.filter((id) => id !== option.id) })
          }
        >
          {option.label}
        </SetupCheckChip>
      ))}

      {custom.map((entry) => (
        <SetupCheckChip
          key={entry}
          checked
          disabled={disabled}
          onCheckedChange={(checked) => {
            if (!checked) update({ custom: custom.filter((candidate) => candidate !== entry) });
          }}
        >
          {entry}
        </SetupCheckChip>
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
  const rowGrid = descriptor.winChance
    ? "grid-cols-[1.25rem_minmax(0,1fr)_6rem_auto]"
    : "grid-cols-[1.25rem_minmax(0,1fr)_auto]";

  return (
    <div className="flex flex-col gap-2">
      <div className={cn("grid items-center gap-2", rowGrid)}>
        {descriptor.winChance && items.length > 0 ? (
          <div aria-hidden className="col-span-full grid grid-cols-subgrid">
            <span className="col-start-3 truncate text-right text-xs font-medium text-muted-foreground">
              {t("WorkspaceSetup.actions.winChance")}
            </span>
          </div>
        ) : null}

        <ol aria-label={descriptor.label} className="col-span-full grid grid-cols-subgrid gap-y-2">
          {items.map((item, index) => (
            <li
              key={index}
              className="col-span-full grid animate-page-result-in grid-cols-subgrid items-center motion-reduce:animate-none"
            >
              <span aria-hidden className="text-right text-xs text-muted-foreground tabular-nums">
                {index + 1}
              </span>

              <Input
                aria-label={t("WorkspaceSetup.interview.entryLabel", { index: index + 1 })}
                disabled={disabled}
                maxLength={80}
                value={item.label}
                onChange={(event) =>
                  update(items.map((entry, at) => (at === index ? { ...entry, label: event.target.value } : entry)))
                }
              />

              {descriptor.winChance ? (
                <FormControlRow>
                  <Input
                    aria-label={t("WorkspaceSetup.interview.winChanceFor", { index: index + 1 })}
                    className="pr-7 text-right"
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
                    className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-sm text-muted-foreground"
                  >
                    %
                  </span>
                </FormControlRow>
              ) : null}

              <div className="flex items-center gap-1">
                <IconButton
                  fieldAction
                  disabled={disabled || index === 0}
                  icon={ArrowUp}
                  label={t("WorkspaceSetup.interview.moveUp")}
                  onClick={() => move(index, -1)}
                />

                <IconButton
                  fieldAction
                  disabled={disabled || index === items.length - 1}
                  icon={ArrowDown}
                  label={t("WorkspaceSetup.interview.moveDown")}
                  onClick={() => move(index, 1)}
                />

                <IconButton
                  fieldAction
                  disabled={disabled}
                  icon={X}
                  label={t("Common.actions.remove")}
                  onClick={() => update(items.filter((_, at) => at !== index))}
                />
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div>
        <Button
          disabled={disabled || items.length >= descriptor.maxItems}
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => update([...items, { label: "" }])}
        >
          <Plus aria-hidden />

          {t("WorkspaceSetup.interview.addEntry")}
        </Button>
      </div>
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
                  className="grid size-4 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground tabular-nums"
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
  const locale = useLocale();
  const [minText, setMinText] = useState(numberText(value?.min));
  const [maxText, setMaxText] = useState(numberText(value?.max));
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    if (value && Number(minText) !== value.min) setMinText(numberText(value.min));
    if (value && (maxText === "" ? null : Number(maxText)) !== value.max) setMaxText(numberText(value.max));
  }
  const clamp = (raw: number) => Math.min(descriptor.max, Math.max(descriptor.min, raw));
  const parse = (text: string) => (text.trim() === "" || Number.isNaN(Number(text)) ? null : Number(text));
  const change = (nextMin: string, nextMax: string) => {
    const min = parse(nextMin);
    if (min !== null) onChange({ format: "range", min, max: descriptor.single ? null : parse(nextMax) });
  };
  const settle = () => {
    const rawMin = parse(minText);
    if (rawMin === null) {
      setMinText(numberText(value?.min));
      return;
    }
    const min = clamp(rawMin);
    const rawMax = descriptor.single ? null : parse(maxText);
    const max = rawMax === null ? null : Math.max(min, clamp(rawMax));
    if (min !== value?.min || max !== value?.max) onChange({ format: "range", min, max });
    setMinText(numberText(min));
    setMaxText(numberText(max));
  };
  const unit =
    descriptor.unit === "currency"
      ? currency
        ? getCurrencyLabel(currency, locale)
        : ""
      : t("WorkspaceSetup.interview.days");
  const boundClassName = descriptor.single ? "w-32" : "min-w-0 flex-1 sm:w-32 sm:flex-none";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className={cn("flex items-center gap-2", !descriptor.single && "min-w-48 flex-1 sm:flex-none")}>
        <Input
          aria-label={descriptor.single ? descriptor.label : t("WorkspaceSetup.interview.rangeFrom")}
          className={boundClassName}
          disabled={disabled}
          inputMode="decimal"
          max={descriptor.max}
          min={descriptor.min}
          type="number"
          value={minText}
          onBlur={settle}
          onChange={(event) => {
            setMinText(event.target.value);
            change(event.target.value, maxText);
          }}
        />

        {descriptor.single ? null : (
          <>
            <span aria-hidden className="text-muted-foreground">
              –
            </span>

            <Input
              aria-label={t("WorkspaceSetup.interview.rangeTo")}
              className={boundClassName}
              disabled={disabled}
              inputMode="decimal"
              max={descriptor.max}
              min={descriptor.min}
              type="number"
              value={maxText}
              onBlur={settle}
              onChange={(event) => {
                setMaxText(event.target.value);
                change(minText, event.target.value);
              }}
            />
          </>
        )}
      </div>

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
    placeholder:
      descriptor.placeholder ?? (descriptor.optional ? t("WorkspaceSetup.interview.optionalPlaceholder") : undefined),
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
    <div aria-labelledby={labelId} className="flex flex-col gap-1.5" role="group">
      <div className="flex flex-wrap items-center gap-1.5">
        <FormLabel id={labelId}>
          {descriptor.label}

          {descriptor.optional ? null : <span className="text-destructive"> *</span>}
        </FormLabel>

        {fromWebsite ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex animate-page-result-in text-primary motion-reduce:animate-none">
                <Sparkles aria-hidden className="size-3.5" />

                <span className="sr-only">{t("WorkspaceSetup.actions.fromWebsite")}</span>
              </span>
            </TooltipTrigger>

            <TooltipContent>{t("WorkspaceSetup.actions.fromWebsite")}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      <FieldBody descriptor={descriptor} {...props} />
    </div>
  );
}
