"use client";

import { useEffect, useId, useMemo } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { EntityType, type Currency } from "@/generated/prisma";

import { AppForm } from "@/components/forms/form-context";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormActions } from "@/components/card/form-actions";
import { Separator } from "@/components/ui/separator";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { useRootStore } from "@/core/stores/root-store.provider";
import { CURRENCIES } from "@/constants/currencies";
import { AppChip } from "@/components/chip/app-chip";
import { TerminologyRelationshipDiagram } from "@/components/entity-terminology/terminology-relationship-diagram";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { useRouter } from "@/i18n/navigation";

type Props = {
  currency: Currency;
};

export const CompanySettingsForm = observer(({ currency }: Props) => {
  const t = useTranslations();
  const router = useRouter();
  const formId = useId();
  const { companySettingsStore: store, terminologyStore } = useRootStore();
  const { plural } = useEntityTerminology();
  const canManage = store.canManage;

  useEffect(() => {
    store.onInitOrRefresh({ currency });
  }, [currency]);

  useEffect(() => {
    store.initTerminology(terminologyStore.overrides);
  }, [store, terminologyStore.overrides]);

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
      <div className="flex w-full max-w-3xl flex-col gap-6">
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

          <p className="text-subdued text-xs">
            {t("CompanySettings.currencyDescription", {
              deals: plural(EntityType.deal),
              services: plural(EntityType.service),
            })}
          </p>
        </div>

        <Separator />

        <TerminologyRelationshipDiagram
          readOnly={!canManage}
          selections={store.form.terminology}
          onPreset={canManage ? store.setTerminologyPreset : undefined}
        />
      </div>
    </AppForm>
  );
});
