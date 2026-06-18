"use client";

import type { ComponentProps } from "react";

import { Avatar } from "@/components/ui/avatar";
import { AppChip } from "@/components/chip/app-chip";

import { FormAutocomplete } from "./form-autocomplete";
import { FormAutocompleteItem } from "./form-autocomplete-item";

type MultiSelectAvatarItem = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null | undefined;
};

type Props = Omit<ComponentProps<typeof FormAutocomplete<MultiSelectAvatarItem>>, "renderValue" | "children"> & {
  onChipClick?: (key: string) => void;
};

function fullName(first?: string | null, last?: string | null): string {
  return `${first ?? ""} ${last ?? ""}`.trim();
}

export function FormAutocompleteAvatar({ items = [], onChipClick, ...props }: Props) {
  return (
    <FormAutocomplete<MultiSelectAvatarItem>
      items={items}
      renderValue={(rendered) =>
        rendered.map((item) => (
          <AppChip
            key={String(item.key ?? (item.data ? item.data.id : ""))}
            startContent={
              <Avatar name={[item.data?.firstName, item.data?.lastName]} size="sm" src={item.data?.avatarUrl} />
            }
          >
            {fullName(item.data?.firstName, item.data?.lastName)}
          </AppChip>
        ))
      }
      onChipClick={onChipClick}
      {...props}
    >
      {(item) =>
        FormAutocompleteItem({
          textValue: fullName(item.firstName, item.lastName),

          children: (
            <div className="flex items-center">
              <Avatar className="mr-3" name={[item.firstName, item.lastName]} size="sm" src={item.avatarUrl} />

              <span className="block truncate">{fullName(item.firstName, item.lastName)}</span>
            </div>
          ),
        })
      }
    </FormAutocomplete>
  );
}
