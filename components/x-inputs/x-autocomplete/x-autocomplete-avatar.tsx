import type { XAutocompleteProps } from "./x-autocomplete";

import { Avatar } from "@heroui/avatar";

import { XChip } from "../../x-chip/x-chip";

import { XAutocomplete } from "./x-autocomplete";
import { XAutocompleteItem } from "./x-autocomplete-item";

type MultiSelectAvatarItem = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null | undefined;
};

type Props = Omit<XAutocompleteProps<MultiSelectAvatarItem>, "renderValue" | "children"> & {
  onChipClick?: (key: string) => void;
};

export function XAutocompleteAvatar({ items = [], onChipClick, ...props }: Props) {
  return (
    <XAutocomplete
      items={items}
      renderValue={(items) =>
        items.map((item) => (
          <XChip
            key={String(item.key ?? (item.data ? item.data.id : ""))}
            startContent={
              <Avatar
                showFallback
                className="max-w-4 max-h-4 text-[8px] mr-0.5"
                name={`${item.data?.firstName ?? ""} ${item.data?.lastName ?? ""}`.trim()}
                src={item.data?.avatarUrl ?? undefined}
              />
            }
            variant="flat"
          >
            {`${item.data?.firstName ?? ""} ${item.data?.lastName ?? ""}`.trim()}
          </XChip>
        ))
      }
      onChipClick={onChipClick}
      {...props}
    >
      {(item) =>
        XAutocompleteItem({
          textValue: `${item.firstName ?? ""} ${item.lastName ?? ""}`.trim(),
          key: item.id,
          value: item.id,
          children: (
            <div className="flex items-center">
              <Avatar
                showFallback
                className="mr-3"
                name={`${item.firstName ?? ""} ${item.lastName ?? ""}`.trim()}
                src={item.avatarUrl ?? undefined}
              />

              <span className="block truncate">{`${item.firstName ?? ""} ${item.lastName ?? ""}`.trim()}</span>
            </div>
          ),
        })
      }
    </XAutocomplete>
  );
}
