"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { EntityType, type Currency } from "@/generated/prisma";

import { AppForm } from "@/components/forms/form-context";
import { FormAutocompleteCurrency } from "@/components/forms/form-autocomplete-currency";
import { FormActions } from "@/components/card/form-actions";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { useRootStore } from "@/core/stores/root-store.provider";
import { TerminologyRelationshipDiagram } from "@/components/entity-terminology/terminology-relationship-diagram";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { useRouter } from "@/i18n/navigation";

import { CompanyForecastingSection } from "./company-forecasting-section";

type Props = {
  currency: Currency;
  dealWeightingColumnId: string | null;
};

export const CompanySettingsForm = observer(({ currency, dealWeightingColumnId }: Props) => {
  const t = useTranslations();
  const router = useRouter();
  const formId = useId();
  const { companySettingsStore: store, terminologyStore } = useRootStore();
  const { plural } = useEntityTerminology();
  const [hasMounted, setHasMounted] = useState(false);
  const canManage = hasMounted && store.canManage;

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    store.onInitOrRefresh({ currency });
  }, [currency]);

  useEffect(() => {
    store.initTerminology(terminologyStore.overrides);
  }, [store, terminologyStore.overrides]);

  useEffect(() => {
    void store.loadForecasting(dealWeightingColumnId);
  }, [store, dealWeightingColumnId]);

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
      <div className="animate-page-result-in flex w-full max-w-3xl flex-col gap-6 motion-reduce:animate-none">
        <div className="flex flex-col gap-1.5">
          <FormAutocompleteCurrency required id="currency" />

          <p className="text-subdued text-xs">
            {t("CompanySettings.currencyDescription", {
              deals: plural(EntityType.deal),
              services: plural(EntityType.service),
            })}
          </p>
        </div>

        <CompanyForecastingSection />

        <div className="border-t border-border" />

        <section className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">{t("CompanySettings.dataModelTitle")}</h2>

          <TerminologyRelationshipDiagram
            readOnly={!canManage}
            selections={store.form.terminology}
            onPreset={canManage ? store.setTerminologyPreset : undefined}
          />
        </section>
      </div>
    </AppForm>
  );
});
