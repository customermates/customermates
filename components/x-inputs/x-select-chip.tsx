import type { ChipProps } from "@heroui/chip";
import type { XSelectProps } from "./x-select";

import { observer } from "mobx-react-lite";

import { XChip } from "../x-chip/x-chip";

import { XSelect } from "./x-select";
import { XSelectItem } from "./x-select-item";

type SelectItem = {
  key: string;
  color: ChipProps["color"];
};

export type XSelectChipProps = Omit<XSelectProps<SelectItem>, "children"> & {
  items: Iterable<SelectItem> | undefined;
  translateFn: (key: string) => string;
};

export const XSelectChip = observer(({ items, translateFn, ...props }: XSelectChipProps) => {
  const itemsArray = items ? Array.from(items) : [];

  return (
    <XSelect
      {...props}
      isMultiline
      items={itemsArray}
      renderValue={(items) => {
        return items.map((item) => (
          <XChip key={item.key} color={item.data?.color}>
            {translateFn(String(item.key))}
          </XChip>
        ));
      }}
    >
      {(item) =>
        XSelectItem({
          key: item.key,
          isDisabled: props.disabledKeys ? Array.from(props.disabledKeys).includes(item.key) : false,
          textValue: translateFn(item.key),
          children: <XChip color={item?.color}>{translateFn(item.key)}</XChip>,
        })
      }
    </XSelect>
  );
});
