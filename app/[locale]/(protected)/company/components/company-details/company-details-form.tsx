"use client";

import { useEffect, useId, useMemo } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { CountryCode } from "@/generated/prisma";

import type { Company } from "@/generated/prisma";
import type { SubscriptionDto } from "@/ee/subscription/get-subscription.interactor";

import { AppForm } from "@/components/forms/form-context";
import { FormInput } from "@/components/forms/form-input";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormAutocompleteCountry } from "@/components/forms/form-autocomplete-country";
import { FormActions } from "@/components/card/form-actions";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { useRootStore } from "@/core/stores/root-store.provider";
import { CURRENCIES } from "@/constants/currencies";
import { AppChip } from "@/components/chip/app-chip";
import { useRouter } from "@/i18n/navigation";

import { SubscriptionPanel } from "../subscription/subscription-panel";
import { SubscribeManageButton } from "../subscription/subscribe-manage-button";

type Props = {
  company: Company;
  initialSubscription: SubscriptionDto | null;
  showSubscription: boolean;
};

export const CompanyDetailsForm = observer(({ company, initialSubscription, showSubscription }: Props) => {
  const t = useTranslations();
  const router = useRouter();
  const formId = useId();
  const { companyDetailsStore: store } = useRootStore();

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

  const topBarActions = useMemo(
    () => (
      <div className="flex items-center gap-2">
        {showSubscription && <SubscribeManageButton />}

        <FormActions formId={formId} store={store} variant="topbar" />
      </div>
    ),
    [formId, store, showSubscription],
  );
  useSetTopBarActions(topBarActions);

  return (
    <AppForm
      id={formId}
      store={store}
      onSubmit={(event) =>
        void store.onSubmit(event).then(() => {
          if (!store.error) router.refresh();
        })
      }
    >
      <div className="flex w-full max-w-3xl flex-col gap-4">
        <FormInput required id="name" />

        <FormInput required id="street" />

        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          <FormInput required id="postalCode" />

          <FormInput required id="city" />
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

        {showSubscription && (
          <div className="mt-4">
            <SubscriptionPanel initialSubscription={initialSubscription} />
          </div>
        )}
      </div>
    </AppForm>
  );
});
