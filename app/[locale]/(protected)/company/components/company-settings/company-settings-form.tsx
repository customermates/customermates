"use client";

import { useEffect, useId, useMemo } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import type { Currency } from "@/generated/prisma";

import { AppForm } from "@/components/forms/form-context";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormActions } from "@/components/card/form-actions";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { useRootStore } from "@/core/stores/root-store.provider";
import { CURRENCIES } from "@/constants/currencies";
import { AppChip } from "@/components/chip/app-chip";
import { useRouter } from "@/i18n/navigation";

type Props = {
  currency: Currency;
};

export const CompanySettingsForm = observer(({ currency }: Props) => {
  const t = useTranslations();
  const router = useRouter();
  const formId = useId();
  const { companySettingsStore: store } = useRootStore();

  useEffect(() => {
    store.onInitOrRefresh({ currency });
  }, [currency]);

  const topBarActions = useMemo(
    () => <FormActions anchorScope="company-settings" formId={formId} store={store} variant="topbar" />,
    [formId, store],
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
        <div className="flex flex-col gap-1.5">
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

          <p className="text-subdued text-xs">{t("CompanySettings.currencyDescription")}</p>
        </div>
      </div>
    </AppForm>
  );
});
