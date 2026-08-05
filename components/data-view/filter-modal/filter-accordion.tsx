"use client";

import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { observer } from "mobx-react-lite";

import { FilterField } from "@/components/data-view/filter-modal/filter-field";
import { useFilterFieldLabel } from "@/components/entity-terminology/use-filter-field-label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

type Props = {
  filters: Filter[];
  baseId: string;
  filterableFields: FilterableField[];
  customColumns?: CustomColumnDto[];
  nested?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
};

export const FilterAccordion = observer(
  ({ filters, baseId, filterableFields, customColumns, nested = false, value, onValueChange }: Props) => {
    const fieldLabel = useFilterFieldLabel();

    const itemClassName = nested ? "border-b-0" : "border-b last:border-b-0 px-3";

    return (
      <Accordion collapsible className="flex flex-col" type="single" value={value} onValueChange={onValueChange}>
        {filters.map((filter, index) => {
          const label = fieldLabel(filter.field, customColumns);
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
  },
);
