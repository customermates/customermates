import type { Filter } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { observer } from "mobx-react-lite";
import { cn } from "@heroui/theme";

import { useFilterSelectItems } from "../use-filter-select-items";

import { XChip } from "@/components/x-chip/x-chip";
import { XAutocomplete } from "@/components/x-inputs/x-autocomplete/x-autocomplete";
import { XAutocompleteItem } from "@/components/x-inputs/x-autocomplete/x-autocomplete-item";

type Props = {
  customColumns?: CustomColumnDto[];
  filter: Filter;
  id: string;
  isValidFilter: boolean;
};

export const XFilterInputSelect = observer(({ customColumns, filter, id, isValidFilter }: Props) => {
  const { items, getItems, isLoading } = useFilterSelectItems(filter, customColumns);

  return (
    <XAutocomplete
      className="h-full"
      getItems={getItems}
      id={id}
      inputProps={{
        classNames: {
          base: "h-full",
          inputWrapper: cn(
            "rounded-l-none h-full",
            isValidFilter ? "border-primary  bg-primary-50/40" : "border-default",
          ),
        },
      }}
      isLoading={isLoading}
      items={items}
      label={null}
      renderValue={(items) =>
        items.map((item) => (
          <XChip key={item.key} color={item.data?.color}>
            {item.data?.textValue}
          </XChip>
        ))
      }
      selectionMode="multiple"
    >
      {(item) =>
        XAutocompleteItem({
          key: item.key,
          textValue: item.textValue,
          startContent: item.startContent,
          children: item.color ? <XChip color={item.color}>{item.textValue}</XChip> : item.textValue,
        })
      }
    </XAutocomplete>
  );
});
