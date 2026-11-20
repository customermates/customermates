"use client";

import { cloneElement, createContext, isValidElement, useContext, useId } from "react";
import { useTranslations } from "next-intl";

import type { AutomationBuilderField } from "./automation-builder-model";
import type { DraftUnavailableKind } from "./automation-draft";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/core/utils/cn";

const BOOLEAN_OPTIONS = ["true", "false"] as const;

export const DATE_FIELD_TYPES = new Set(["date", "dateTime"]);

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <h3 className="text-sm font-semibold">{title}</h3>

      {children}
    </section>
  );
}

const FieldRowContext = createContext(false);

export function FieldRow({ children }: { children: React.ReactNode }) {
  return (
    <FieldRowContext.Provider value={true}>
      <div className="flex flex-wrap gap-3" data-automation-field-row="">
        {children}
      </div>
    </FieldRowContext.Provider>
  );
}

export function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  const generatedId = useId();
  const inRow = useContext(FieldRowContext);
  const control = isValidElement<{ id?: string }>(children) ? children : null;
  const id = control ? (control.props.id ?? generatedId) : undefined;

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", inRow ? "grow basis-40" : "flex-1")} data-automation-field="">
      <Label className="text-xs text-muted-foreground" htmlFor={id}>
        {label}
      </Label>

      {control ? cloneElement(control, { id }) : children}
    </div>
  );
}

export function Choose({
  id,
  value,
  items,
  placeholder,
  label,
  onChange,
}: {
  id?: string;
  value: string;
  items: { id: string; label: string }[];
  placeholder: string;
  label: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="w-full" id={id}>
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

export function PickMany({
  id,
  values,
  items,
  label,
  onChange,
}: {
  id?: string;
  values: string[];
  items: { id: string; label: string }[];
  label: string;
  onChange: (values: string[]) => void;
}) {
  const t = useTranslations();
  const baseId = useId();
  const stale = values.filter((value) => !items.some((item) => item.id === value));
  const entries = [...items, ...stale.map((id) => ({ id, label: t("Automations.unavailable.item"), stale: true }))];
  const toggle = (id: string, checked: boolean) =>
    onChange(checked ? [...values.filter((value) => value !== id), id] : values.filter((value) => value !== id));

  return (
    <div
      aria-label={label}
      className="flex max-h-40 flex-wrap gap-x-4 gap-y-2 overflow-y-auto rounded-md border border-input p-2"
      data-automation-pick-many=""
      id={id}
      role="group"
    >
      {entries.map((entry) => {
        const boxId = `${baseId}-${entry.id}`;
        return (
          <span key={entry.id} className="flex items-center gap-2">
            <Checkbox
              checked={values.includes(entry.id)}
              id={boxId}
              onCheckedChange={(checked) => toggle(entry.id, checked === true)}
            />

            <Label className={"stale" in entry ? "font-normal text-destructive" : "font-normal"} htmlFor={boxId}>
              {entry.label}
            </Label>
          </span>
        );
      })}
    </div>
  );
}

export function UnavailableNote({ what }: { what: DraftUnavailableKind | undefined }) {
  const t = useTranslations();
  if (!what) return null;
  return (
    <p className="text-xs text-destructive" data-automation-unavailable={what} role="alert">
      {unavailableText(t, what)}
    </p>
  );
}

function unavailableText(t: ReturnType<typeof useTranslations>, what: DraftUnavailableKind): string {
  switch (what) {
    case "list":
      return t("Automations.unavailable.list");
    case "field":
      return t("Automations.unavailable.field");
    case "option":
      return t("Automations.unavailable.option");
    case "webhook":
      return t("Automations.unavailable.webhook");
    case "webhookEvent":
      return t("Automations.unavailable.webhookEvent");
    case "runner":
      return t("Automations.unavailable.runner");
    case "model":
      return t("Automations.unavailable.model");
  }
}

export function ValueInput({
  id,
  field,
  value,
  label,
  onChange,
}: {
  id?: string;
  field: AutomationBuilderField | undefined;
  value: string;
  label: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations();
  if (field?.valueType === "select") {
    return (
      <Choose
        id={id}
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
        id={id}
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
      id={id}
      inputMode={field?.valueType === "number" || field?.valueType === "currency" ? "decimal" : undefined}
      placeholder={field?.valueType === "date" ? "2026-12-31" : undefined}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function timeZoneIds(current: string): { id: string; label: string }[] {
  const supported = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  const ids = supported.includes(current) || !current ? supported : [current, ...supported];
  return (ids.length ? ids : ["UTC"]).map((id) => ({ id, label: id }));
}

export function TimeZonePicker({
  id,
  value,
  label,
  onChange,
}: {
  id?: string;
  value: string;
  label: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations();
  return (
    <Choose
      id={id}
      items={timeZoneIds(value)}
      label={label}
      placeholder={t("AutomationRules.builder.choose")}
      value={value}
      onChange={onChange}
    />
  );
}
