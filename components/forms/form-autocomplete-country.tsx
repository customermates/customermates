"use client";

import type { ComponentProps } from "react";

import { useMemo } from "react";
import { useLocale } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { countryOptionsForLocale } from "@/constants/countries";
import { appLocaleOrDefault } from "@/i18n/locale-registry";

import { FormAutocomplete } from "./form-autocomplete";
import { FormAutocompleteItem } from "./form-autocomplete-item";
import { FormAutocompleteCountryItem } from "./form-autocomplete-country-item";

type CountryItem = { key: string; label: string };

type Props = Omit<ComponentProps<typeof FormAutocomplete<CountryItem>>, "renderValue" | "children" | "items">;

export function FormAutocompleteCountry(props: Props) {
  const locale = appLocaleOrDefault(useLocale());
  const items: CountryItem[] = useMemo(() => countryOptionsForLocale(locale), [locale]);

  return (
    <FormAutocomplete<CountryItem>
      items={items}
      renderValue={(rendered) =>
        rendered.map((item) => (
          <AppChip key={item.key}>
            <FormAutocompleteCountryItem
              countryKey={item.data?.key ?? item.key}
              label={item.data?.label ?? ""}
              size="sm"
            />
          </AppChip>
        ))
      }
      {...props}
    >
      {(country) =>
        FormAutocompleteItem({
          textValue: country.label,
          children: <FormAutocompleteCountryItem countryKey={country.key} label={country.label} />,
        })
      }
    </FormAutocomplete>
  );
}
