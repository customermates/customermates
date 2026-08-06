"use client";

import type { ComponentProps } from "react";

import { useLocale } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { CURRENCIES, getCurrencyLabel } from "@/constants/currencies";

import { FormAutocomplete } from "./form-autocomplete";
import { FormAutocompleteItem } from "./form-autocomplete-item";

type CurrencyItem = (typeof CURRENCIES)[number];
type Props = Omit<ComponentProps<typeof FormAutocomplete<CurrencyItem>>, "children" | "items" | "renderValue">;

export function FormAutocompleteCurrency(props: Props) {
  const locale = useLocale();

  return (
    <FormAutocomplete<CurrencyItem>
      {...props}
      items={CURRENCIES}
      renderValue={(items) => items.map(({ key }) => <AppChip key={key}>{getCurrencyLabel(key, locale)}</AppChip>)}
    >
      {({ key }) => {
        const label = getCurrencyLabel(key, locale);
        return FormAutocompleteItem({ children: label, textValue: label });
      }}
    </FormAutocomplete>
  );
}
