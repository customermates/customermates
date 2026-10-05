"use client";

import { useEffect, useId, useMemo } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import type { Currency } from "@/generated/prisma";

import { AppForm } from "@/components/forms/form-context";
import { FormAutocompleteCurrency } from "@/components/forms/form-autocomplete-currency";
import { FormActions } from "@/components/card/form-actions";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { useRootStore } from "@/core/stores/root-store.provider";
import { Button } from "@/components/ui/button";
import { IntlLink } from "@/i18n/navigation";
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
        store.onSubmit(event).then(() => {
          if (!store.error) router.refresh();
        })
      }
    >
      <div className="animate-page-result-in flex w-full max-w-3xl flex-col gap-6 motion-reduce:animate-none">
        <div className="flex flex-col gap-1.5">
          <FormAutocompleteCurrency required id="currency" inputId="company-settings-currency" />
        </div>

        <div className="border-t border-border" />

        <section className="flex flex-col gap-1" id="company-settings-data-model">
          <h2 className="text-sm font-medium">{t("CompanySettings.dataModelTitle")}</h2>

          <Button asChild className="w-fit" size="sm" variant="secondary">
            <IntlLink href="/configure">{t("RecordModel.configure")}</IntlLink>
          </Button>
        </section>
      </div>
    </AppForm>
  );
});
