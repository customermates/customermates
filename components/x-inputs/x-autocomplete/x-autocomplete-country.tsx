"use client";

import type { XAutocompleteProps } from "./x-autocomplete";

import { Avatar } from "@heroui/avatar";
import { useTranslations } from "next-intl";

import { COUNTRIES } from "../../../constants/countries";
import { XChip } from "../../x-chip/x-chip";

import { XAutocompleteItem } from "./x-autocomplete-item";
import { XAutocomplete } from "./x-autocomplete";

type CountryItem = { key: string; value: { label: string } };

type Props = Omit<XAutocompleteProps<CountryItem>, "renderValue" | "children" | "items">;

export function XAutocompleteCountry(props: Props) {
  const t = useTranslations("Common");

  const items: CountryItem[] = Object.entries(COUNTRIES).map(([key, value]) => ({
    key,
    value,
  }));

  return (
    <XAutocomplete
      items={items}
      renderValue={(items) =>
        items.map((item) => (
          <XChip key={item.key}>
            <div className="flex w-full gap-1 items-center justify-start">
              <Avatar
                alt={t("imageAlt.countryFlag", { country: item.data?.value.label ?? "" })}
                className="w-3 h-3 inline-block"
                src={`https://flagcdn.com/${item.data?.key.toLowerCase()}.svg`}
              />

              <span className="truncate mt-0.5">{item.data?.value.label}</span>
            </div>
          </XChip>
        ))
      }
      {...props}
    >
      {(country) =>
        XAutocompleteItem({
          key: country.key,
          textValue: country.value.label,
          children: (
            <div className="flex w-full gap-2 items-center justify-start">
              <Avatar
                alt={t("imageAlt.countryFlag", { country: country.value.label })}
                className="w-5 h-5 inline-block"
                src={`https://flagcdn.com/${country.key.toLowerCase()}.svg`}
              />

              {country.value.label}
            </div>
          ),
        })
      }
    </XAutocomplete>
  );
}
