"use client";

import type { FilterOperatorKey } from "@/core/base/base-query-builder";

import { CheckIcon } from "lucide-react";
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

export function FilterOperatorMenu({ operators, current, onSelect }: MenuProps) {
  const t = useTranslations();
  const operatorLabel = useFilterOperatorLabel();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          data-palette-operator-trigger
          aria-label={t("Common.filters.palette.editOperator")}
          className="h-6 min-w-0 px-1.5 text-xs font-normal"
          disabled={operators.length === 0}
          size="xs"
          type="button"
          variant="ghost"
        >
          <span className="truncate">{current ? operatorLabel(current) : t("Common.filters.selectOperator")}</span>
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
