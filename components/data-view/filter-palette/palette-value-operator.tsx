"use client";

import type { FilterOperatorKey } from "@/core/base/base-query-builder";

import { CheckIcon } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { useFilterOperatorLabel } from "@/components/data-view/filter-modal/use-filter-operator-label";

type Props = {
  operators: FilterOperatorKey[];
  current: FilterOperatorKey | undefined;
  onSelect: (operator: FilterOperatorKey) => void;
};

export const PaletteValueOperator = observer(function PaletteValueOperator({ operators, current, onSelect }: Props) {
  const t = useTranslations();
  const operatorLabel = useFilterOperatorLabel();

  return (
    <CommandList className="max-h-none! overflow-visible">
      <CommandEmpty>{t("Common.inputs.emptyContent")}</CommandEmpty>

      <CommandGroup>
        {operators.map((operator) => (
          <CommandItem
            key={operator}
            data-palette-value={operator}
            keywords={[operatorLabel(operator)]}
            value={operatorLabel(operator)}
            onSelect={() => onSelect(operator)}
          >
            <span className="truncate">{operatorLabel(operator)}</span>

            {operator === current && <CheckIcon className="ml-auto size-3.5" />}
          </CommandItem>
        ))}
      </CommandGroup>
    </CommandList>
  );
});
