"use client";

import type { FilterOperatorKey } from "@/core/base/base-query-builder";

import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFilterOperatorLabel } from "@/components/data-view/filter-modal/use-filter-operator-label";

type MenuProps = {
  operators: FilterOperatorKey[];
  current: FilterOperatorKey | undefined;
  onSelect: (operator: FilterOperatorKey) => void;
};

export function PaletteOperatorMenu({ operators, current, onSelect }: MenuProps) {
  const t = useTranslations();
  const operatorLabel = useFilterOperatorLabel();
  const currentLabel = current ? operatorLabel(current) : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          data-palette-operator-trigger
          aria-label={
            currentLabel
              ? t("Common.filters.palette.editOperatorNamed", { operator: currentLabel })
              : t("Common.filters.palette.editOperator")
          }
          className="min-w-0 shrink font-normal"
          disabled={operators.length === 0}
          size="sm"
          type="button"
          variant="field"
        >
          <span className="truncate">{currentLabel ?? t("Common.filters.selectOperator")}</span>

          <ChevronDownIcon aria-hidden className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start">
        {operators.map((operator) => (
          <DropdownMenuItem key={operator} onSelect={() => onSelect(operator)}>
            <span className="flex-1">{operatorLabel(operator)}</span>

            {operator === current && <CheckIcon className="size-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
