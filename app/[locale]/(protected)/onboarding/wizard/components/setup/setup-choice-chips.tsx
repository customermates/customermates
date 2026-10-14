"use client";

import type { ReactNode } from "react";

import { Check, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/core/utils/cn";

export const SETUP_CHIP_CLASS =
  "h-8 rounded-full px-3 text-sm font-normal data-[state=on]:border-primary/40 data-[state=on]:bg-primary/15 data-[state=on]:text-primary-soft-foreground data-[state=on]:hover:bg-primary/20";

type ChipProps = {
  pressed: boolean;
  disabled?: boolean;
  onPressedChange: (pressed: boolean) => void;
  children: ReactNode;
  role?: "radio" | "checkbox";
};

export function SetupChip({ pressed, disabled, onPressedChange, children, role }: ChipProps) {
  return (
    <Toggle
      aria-checked={role ? pressed : undefined}
      className={SETUP_CHIP_CLASS}
      disabled={disabled}
      pressed={pressed}
      role={role}
      size="sm"
      variant="outline"
      onPressedChange={onPressedChange}
    >
      {pressed ? <Check aria-hidden className="size-3.5" /> : null}

      {children}
    </Toggle>
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
      <Button
        className="h-8 rounded-full border-dashed px-3 font-normal"
        disabled={disabled}
        size="sm"
        type="button"
        variant="secondary"
        onClick={() => setOpen(true)}
      >
        <Plus />

        {t("WorkspaceSetup.actions.addOwn")}
      </Button>
    );
  }

  return (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <Input
        ref={input}
        aria-label={t("WorkspaceSetup.actions.addOwn")}
        className="h-8 sm:w-56"
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

      <Button disabled={disabled || !draft.trim()} size="sm" type="button" variant="secondary" onClick={submit}>
        {t("Common.actions.add")}
      </Button>
    </div>
  );
}

type RemovableChipProps = { label: string; disabled?: boolean; onRemove: () => void };

export function SetupRemovableChip({ label, disabled, onRemove }: RemovableChipProps) {
  const t = useTranslations();
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-1 rounded-full border border-primary/40 bg-primary/15 pr-1 pl-3 text-sm text-primary-soft-foreground",
        "animate-page-result-in motion-reduce:animate-none",
      )}
    >
      <Check aria-hidden className="size-3.5" />

      <span className="max-w-48 truncate">{label}</span>

      <button
        aria-label={`${t("Common.actions.remove")}: ${label}`}
        className="flex size-6 items-center justify-center rounded-full outline-none hover:bg-primary/20 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
        disabled={disabled}
        type="button"
        onClick={onRemove}
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </span>
  );
}
