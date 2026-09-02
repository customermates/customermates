"use client";

import type { OperatorChipOption } from "./use-operator-chip-options";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { ClickableChip } from "@/components/chip/clickable-chip";
import { useDeleteConfirmation } from "@/components/modal/hooks/use-delete-confirmation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  value: string | null;
  options: readonly OperatorChipOption[];
  emptyLabel: string;
  confirmTitle: string;
  confirmMessage: (option: OperatorChipOption) => string;
  readOnly?: boolean;
  onCommit: (value: string) => Promise<boolean>;
};

export function OperatorChipSelect({
  value,
  options,
  emptyLabel,
  confirmTitle,
  confirmMessage,
  readOnly,
  onCommit,
}: Props) {
  const t = useTranslations();
  const { showConfirmation } = useDeleteConfirmation();
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? null;

  if (readOnly) {
    return selected ? (
      <AppChip size="sm" variant={selected.color}>
        {selected.label}
      </AppChip>
    ) : (
      <span className="text-sm text-muted-foreground">{emptyLabel}</span>
    );
  }

  function select(option: OperatorChipOption) {
    setIsOpen(false);
    if (option.value === value) return;

    showConfirmation({
      title: confirmTitle,
      message: confirmMessage(option),
      confirmLabel: t("Common.actions.confirm"),
      confirmVariant: "default",
      successKey: "Common.notifications.updated",
      onConfirm: () => onCommit(option.value),
    });
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex max-w-full" type="button">
          <ClickableChip size="sm" variant={selected?.color ?? "secondary"}>
            {selected?.label ?? emptyLabel}
          </ClickableChip>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="max-h-60 overflow-y-auto">
        {options.map((option) => (
          <DropdownMenuItem key={option.value} onSelect={() => select(option)}>
            <AppChip size="sm" variant={option.color}>
              {option.label}
            </AppChip>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
