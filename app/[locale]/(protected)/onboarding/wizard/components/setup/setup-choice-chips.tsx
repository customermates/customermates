"use client";

import type { ReactNode } from "react";

import { Check, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/core/utils/cn";

export const SETUP_CHIP_CLASS = "px-3";

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
      {pressed ? <Check aria-hidden /> : null}

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

type RemovableChipProps = { label: string; disabled?: boolean; onRemove: () => void };

export function SetupRemovableChip({ label, disabled, onRemove }: RemovableChipProps) {
  const t = useTranslations();
  return (
    <AppChip
      className={cn(SETUP_CHIP_CLASS, "animate-page-result-in motion-reduce:animate-none")}
      endContent={
        <IconButton
          fieldAction
          disabled={disabled}
          icon={X}
          label={`${t("Common.actions.remove")}: ${label}`}
          onClick={onRemove}
        />
      }
      size="lg"
      startContent={<Check aria-hidden />}
    >
      {label}
    </AppChip>
  );
}
