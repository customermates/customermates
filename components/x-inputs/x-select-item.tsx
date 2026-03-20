import type { SelectItemProps } from "@heroui/select";

import { SelectItem } from "@heroui/select";

export function XSelectItem<T extends object>({ key, ...props }: SelectItemProps<T>) {
  const defaultProps: SelectItemProps<T> = {
    variant: "bordered",
    ...props,
  };

  return <SelectItem key={key} {...defaultProps} />;
}
