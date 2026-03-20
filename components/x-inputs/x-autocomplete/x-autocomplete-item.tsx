import type { AutocompleteItemProps } from "@heroui/autocomplete";

import { AutocompleteItem } from "@heroui/autocomplete";

export function XAutocompleteItem<T extends object>({ key, ...props }: AutocompleteItemProps<T>) {
  return <AutocompleteItem key={key} variant="bordered" {...props} />;
}
