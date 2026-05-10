"use client";

import type { Company } from "@/generated/prisma";

import { useEffect, useId } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { CountryCode } from "@/generated/prisma";

import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormAutocompleteCountry } from "@/components/forms/form-autocomplete-country";
import { AppChip } from "@/components/chip/app-chip";
import { CURRENCIES } from "@/constants/currencies";
import { useRootStore } from "@/core/stores/root-store.provider";

type Props = {
  initialCompany: Company;
};

export const StepCompany = observer(({ initialCompany }: Props) => {
  const t = useTranslations("");
  const formId = useId();
  const { companyDetailsStore, onboardingWizardStore } = useRootStore();

  useEffect(() => {
    companyDetailsStore.onInitOrRefresh({
      name: initialCompany.name ?? "",
      street: initialCompany.street ?? "",
      city: initialCompany.city ?? "",
      country: initialCompany.country ?? CountryCode.de,
      postalCode: initialCompany.postalCode ?? "",
      currency: initialCompany.currency,
    });
  }, [initialCompany]);

  useEffect(() => {
    onboardingWizardStore.setBeforeNext(async () => {
      await companyDetailsStore.onSubmit();
      return !companyDetailsStore.error;
    });
    return () => onboardingWizardStore.setBeforeNext(null);
  }, []);

  return (
    <AppForm id={formId} store={companyDetailsStore} onSubmit={(e) => void companyDetailsStore.onSubmit(e)}>
      <div className="flex flex-col gap-3">
        <FormInput
          required
          autoComplete="organization"
          description={t("OnboardingWizard.companyNameDescription")}
          id="name"
          name="organization"
        />

        <FormInput autoComplete="street-address" id="street" name="street-address" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormInput autoComplete="postal-code" id="postalCode" name="postal-code" />

          <FormInput autoComplete="address-level2" id="city" name="address-level2" />
        </div>

        <FormAutocompleteCountry required id="country" />

        <FormAutocomplete
          required
          id="currency"
          items={CURRENCIES}
          renderValue={(items) =>
            items.map((item) => <AppChip key={item.key}>{t(`Common.currencies.${item.key}`)}</AppChip>)
          }
        >
          {({ key }) => <span>{t(`Common.currencies.${key}`)}</span>}
        </FormAutocomplete>
      </div>
    </AppForm>
  );
});
