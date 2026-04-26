"use client";

import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { FilterField } from "@/components/data-view/filter-modal/filter-field";
import { isCustomField } from "@/components/data-view/table-view.utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

type Props = {
  filters: Filter[];
  baseId: string;
  filterableFields: FilterableField[];
  customColumns?: CustomColumnDto[];
  nested?: boolean;
};

export const FilterAccordion = observer(function FilterAccordion({
  filters,
  baseId,
  filterableFields,
  customColumns,
  nested = false,
}: Props) {
  const t = useTranslations("Common");

  const itemClassName = nested ? "border-b-0" : "border-b last:border-b-0 px-3";

  return (
    <Accordion collapsible className="flex flex-col" type="single">
      {filters.map((filter, index) => {
        const isCustom = isCustomField(filter.field);
        const customColumn = isCustom ? customColumns?.find((col) => col.id === filter.field) : null;
        const label = isCustom ? (customColumn?.label ?? filter.field) : t(`filters.fields.${filter.field}`);
        const hasValue = filter.operator !== undefined;

        return (
          <AccordionItem key={filter.field} className={itemClassName} value={filter.field}>
            <AccordionTrigger className="py-2.5 text-sm font-medium hover:no-underline">
              <span className="flex items-center gap-2">
                {label}

                {hasValue && <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />}
              </span>
            </AccordionTrigger>

            <AccordionContent className="pt-0 pb-3 flex flex-col gap-2">
              <FilterField
                inline
                baseId={`${baseId}[${index}]`}
                customColumns={customColumns}
                filter={filter}
                filterableFields={filterableFields}
              />
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
});
