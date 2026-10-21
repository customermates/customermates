"use client";

import type { ReactNode } from "react";

import { Check, Plus } from "lucide-react";
import { Checkbox as CheckboxPrimitive, RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toggleVariants } from "@/components/ui/toggle";
import { cn } from "@/core/utils/cn";

export const SETUP_CHIP_CLASS =
  "px-3 data-[state=on]:border-primary/40 data-[state=on]:bg-primary/20 data-[state=on]:text-primary-soft-foreground data-[state=on]:hover:bg-primary/25 data-[state=on]:hover:text-primary-soft-foreground";

const SETUP_CHOICE_CLASS = cn(
  toggleVariants({ variant: "outline", size: "sm" }),
  "px-3 aria-checked:border-primary/40 aria-checked:bg-primary/20 aria-checked:text-primary-soft-foreground aria-checked:hover:bg-primary/25 aria-checked:hover:text-primary-soft-foreground",
);

type ChoiceGroupProps = {
  label: string;
  value: string | null;
  disabled?: boolean;
  onValueChange: (value: string) => void;
  children: ReactNode;
};

export function SetupChoiceGroup({ label, value, disabled, onValueChange, children }: ChoiceGroupProps) {
  return (
    <RadioGroupPrimitive.Root
      aria-label={label}
      className="flex flex-wrap gap-2"
      disabled={disabled}
      value={value ?? ""}
      onValueChange={onValueChange}
    >
      {children}
    </RadioGroupPrimitive.Root>
  );
}

type RadioChipProps = {
  value: string;
  checked: boolean;
  invalid?: boolean;
  children: ReactNode;
};

export function SetupRadioChip({ value, checked, invalid, children }: RadioChipProps) {
  return (
    <RadioGroupPrimitive.Item aria-invalid={invalid || undefined} className={SETUP_CHOICE_CLASS} value={value}>
      {checked ? <Check aria-hidden /> : null}

      {children}
    </RadioGroupPrimitive.Item>
  );
}

type CheckChipProps = {
  checked: boolean;
  disabled?: boolean;
  invalid?: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: ReactNode;
};

export function SetupCheckChip({ checked, disabled, invalid, onCheckedChange, children }: CheckChipProps) {
  return (
    <CheckboxPrimitive.Root
      aria-invalid={invalid || undefined}
      checked={checked}
      className={SETUP_CHOICE_CLASS}
      disabled={disabled}
      onCheckedChange={(next) => onCheckedChange(next === true)}
    >
      {checked ? <Check aria-hidden /> : null}

      {children}
    </CheckboxPrimitive.Root>
  );
}

type CustomEntryProps = {
  disabled?: boolean;
  maxLength?: number;
  onAdd: (value: string) => void;
};

export function SetupCustomEntry({ disabled, maxLength = 80, onAdd }: CustomEntryProps) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  const submit = () => {
    const value = draft.trim();
    if (!value) return;
    onAdd(value);
    setDraft("");
  };

  if (!open) {
    return (
      <Button disabled={disabled} size="sm" type="button" variant="ghost" onClick={() => setOpen(true)}>
        <Plus aria-hidden />

        {t("WorkspaceSetup.actions.addOwn")}
      </Button>
    );
  }

  return (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <Input
        ref={input}
        aria-label={t("WorkspaceSetup.actions.addOwn")}
        className="sm:w-56"
        disabled={disabled}
        maxLength={maxLength}
        placeholder={t("WorkspaceSetup.interview.customPlaceholder")}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          }
          if (event.key === "Escape") setOpen(false);
        }}
      />

      <Button disabled={disabled || !draft.trim()} type="button" variant="secondary" onClick={submit}>
        {t("Common.actions.add")}
      </Button>
    </div>
  );
}
