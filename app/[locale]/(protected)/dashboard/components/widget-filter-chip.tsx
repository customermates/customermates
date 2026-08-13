"use client";

import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { Filter } from "@/core/base/base-get.schema";

import { useTranslations } from "next-intl";

import { FilterChipValue } from "@/components/data-view/filter-modal/filter-chip-display";

import { WIDGET_INTERACTIVE_ATTRIBUTE } from "./widget-interaction";

type Props = {
  customColumns?: CustomColumnDto[];
  filter: Filter;
  label: string;
  onOpen: () => void;
};

export function WidgetFilterChip({ customColumns, filter, label, onOpen }: Props) {
  const t = useTranslations();

  return (
    <span
      className="hover:bg-muted/50 hover:text-foreground cursor-pointer transition-[color,background-color,transform] active:scale-[0.97] motion-reduce:transition-none"
      role="button"
      tabIndex={0}
      title={label}
      {...{ [WIDGET_INTERACTIVE_ATTRIBUTE]: "true" }}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;

        event.preventDefault();
        event.stopPropagation();
        onOpen();
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <FilterChipValue
        customColumns={customColumns}
        filter={filter}
        label={label}
        operator={t(`Common.filters.operators.${filter.operator}`)}
      />
    </span>
  );
}
