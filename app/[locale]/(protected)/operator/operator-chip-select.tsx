"use client";

import type { OperatorActionState } from "./operator-action-state";

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

import { useOperatorErrorToast } from "./use-operator-error-toast";

export type OperatorChipVariant = "secondary" | "success" | "warning" | "destructive" | "info";

export type OperatorChipOption = { value: string; label: string; variant: OperatorChipVariant };

type Props = {
  value: string | null;
  options: readonly OperatorChipOption[];
  emptyLabel: string;
  confirmTitle: string;
  confirmMessage: (option: OperatorChipOption) => string;
  readOnly?: boolean;
  onCommit: (value: string, operationId: string) => Promise<OperatorActionState<unknown>>;
  onCommitted: () => void;
};

export function OperatorChipSelect({
  value,
  options,
  emptyLabel,
  confirmTitle,
  confirmMessage,
  readOnly,
  onCommit,
  onCommitted,
}: Props) {
  const t = useTranslations();
  const toastOperatorError = useOperatorErrorToast();
  const { showConfirmation } = useDeleteConfirmation();
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? null;

  if (readOnly) {
    return selected ? (
      <AppChip size="sm" variant={selected.variant}>
        {selected.label}
      </AppChip>
    ) : (
      <span className="text-sm text-muted-foreground">{emptyLabel}</span>
    );
  }

  function select(option: OperatorChipOption) {
    setIsOpen(false);
    if (option.value === value) return;

    const operationId = globalThis.crypto.randomUUID();

    showConfirmation({
      title: confirmTitle,
      message: confirmMessage(option),
      confirmLabel: t("Common.actions.confirm"),
      confirmVariant: "default",
      successKey: "Common.notifications.updated",
      onConfirm: async () => {
        const result = await onCommit(option.value, operationId);
        if (result.status !== "success") {
          if (result.status === "error") toastOperatorError(result.errorCode);
          return false;
        }

        onCommitted();
        return true;
      },
    });
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <span>
          <ClickableChip size="sm" variant={selected?.variant ?? "secondary"}>
            {selected?.label ?? emptyLabel}
          </ClickableChip>
        </span>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="max-h-60 overflow-y-auto">
        {options.map((option) => (
          <DropdownMenuItem key={option.value} onSelect={() => select(option)}>
            <AppChip size="sm" variant={option.variant}>
              {option.label}
            </AppChip>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
