import type { DropdownItemProps } from "@heroui/dropdown";

import { DropdownItem } from "@heroui/dropdown";

export function XDropdownItem<T extends object>({ key, ...props }: DropdownItemProps<T>) {
  return <DropdownItem key={key} variant="bordered" {...props} />;
}
