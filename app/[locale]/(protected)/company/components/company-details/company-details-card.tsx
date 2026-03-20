"use client";

import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { CountryCode } from "@/generated/prisma";
import type { Company } from "@/generated/prisma";

import { XInput } from "@/components/x-inputs/x-input";
import { XCard } from "@/components/x-card/x-card";
import { XForm } from "@/components/x-inputs/x-form";
import { XCardBody } from "@/components/x-card/x-card-body";
import { XAutocompleteCountry } from "@/components/x-inputs/x-autocomplete/x-autocomplete-country";
import { XCardFormFooter } from "@/components/x-card/x-card-form-footer";
import { useRootStore } from "@/core/stores/root-store.provider";
import { CURRENCIES } from "@/constants/currencies";
import { XAutocomplete } from "@/components/x-inputs/x-autocomplete/x-autocomplete";
import { XAutocompleteItem } from "@/components/x-inputs/x-autocomplete/x-autocomplete-item";
import { XAlert } from "@/components/x-alert";
import { XChip } from "@/components/x-chip/x-chip";
import { XCardDefaultHeader } from "@/components/x-card/x-card-default-header";
import { useRouter } from "@/i18n/navigation";

type Props = {
  isCompanyOnboarding: boolean;
  company: Company;
};

export const CompanyDetailsCard = observer(({ company, isCompanyOnboarding }: Props) => {
  const t = useTranslations("");
  const router = useRouter();
  const { companyDetailsCardStore: store } = useRootStore();

  useEffect(() => {
    store.onInitOrRefresh({
      name: company.name ?? "",
      street: company.street ?? "",
      city: company.city ?? "",
      country: company.country ?? CountryCode.de,
      postalCode: company.postalCode ?? "",
      currency: company.currency,
    });
  }, [company]);

  return (
    <XForm
      store={store}
      onSubmit={(event) =>
        void store.onSubmit(event).then(() => {
          if (!store.error) router.refresh();
        })
      }
    >
      <XCard>
        <XCardDefaultHeader title={t("CompanyDetailsCard.title")} />

        <XCardBody>
          {isCompanyOnboarding && !store.hasSubmittedSuccessfully && (
            <XAlert color="warning">
              <p className="text-x-sm"> {t("Common.systemTasks.companyOnboarding.description")} </p>
            </XAlert>
          )}

          <XInput isRequired id="name" />

          <XInput isRequired id="street" />

          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
            <XInput isRequired id="postalCode" />

            <XInput isRequired id="city" />
          </div>

          <XAutocompleteCountry isRequired allowsEmptyCollection={false} id="country" />

          <XAutocomplete
            isRequired
            allowsEmptyCollection={false}
            id="currency"
            items={CURRENCIES}
            renderValue={(items) =>
              items.map((item) => <XChip key={item.key}>{t(`Common.currencies.${item.key}`)}</XChip>)
            }
          >
            {({ key }) => XAutocompleteItem({ key, children: t(`Common.currencies.${key}`) })}
          </XAutocomplete>
        </XCardBody>

        <XCardFormFooter />
      </XCard>
    </XForm>
  );
});
