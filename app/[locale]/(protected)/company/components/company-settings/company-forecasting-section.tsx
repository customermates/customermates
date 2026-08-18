"use client";

import type { ReactNode } from "react";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { EntityType } from "@/generated/prisma";

import { AppChip } from "@/components/chip/app-chip";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { FormNumberInput } from "@/components/forms/form-number-input";
import { FormSelect } from "@/components/forms/form-select";
import { InfoRow } from "@/components/shared/info-row";
import { PageState } from "@/components/page-state/page-state";
import { SettingsFieldSkeleton, SettingsFormSkeleton } from "@/components/forms/settings-form-skeleton";
import { useRootStore } from "@/core/stores/root-store.provider";

import { resolveForecastingState } from "./company-forecasting-state";

const NO_COLUMN_VALUE = "__none__";

export const CompanyForecastingSection = observer(() => {
  const t = useTranslations();
  const { companySettingsStore: store, intlStore } = useRootStore();
  const { singular } = useEntityTerminology();

  const state = resolveForecastingState({
    status: store.forecastingRequest,
    columnId: store.form.dealWeightingColumnId,
    hasStageValueSums: store.selectedStageValueSums !== undefined,
  });

  const columnItems = [
    { value: NO_COLUMN_VALUE, label: t("CompanySettings.forecasting.noColumn") },
    ...store.dealStageColumns.map((column) => ({ value: column.id, label: column.label })),
  ];

  const optionByValue = new Map((store.selectedStageColumn?.options ?? []).map((option) => [option.value, option]));

  let body: ReactNode;

  switch (state) {
    case "loading":
      body = (
        <PageState
          background={
            <SettingsFormSkeleton className="gap-3">
              <SettingsFieldSkeleton animated short />

              <SettingsFieldSkeleton animated short />
            </SettingsFormSkeleton>
          }
          className="min-h-24"
          label={t("PageState.loading")}
          state="loading"
        />
      );
      break;
    case "error":
      body = (
        <p className="text-xs text-destructive" role="alert">
          {t("Common.errors.generic")}
        </p>
      );
      break;
    case "empty":
      body = null;
      break;
    case "content":
      body = (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col gap-2">
            {store.form.dealStageWeights.map((stage, index) => {
              const option = optionByValue.get(stage.optionValue);
              const label = option?.label ?? stage.optionValue;

              return (
                <li key={stage.optionValue} className="flex items-center justify-between gap-3">
                  <AppChip variant={option?.color}>{label}</AppChip>

                  <FormNumberInput
                    aria-label={label}
                    className="text-right"
                    containerClassName="w-24 shrink-0"
                    endContent="%"
                    id={`dealStageWeights[${index}].weight`}
                    label={null}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      );
      break;
    default: {
      const exhaustive: never = state;
      body = exhaustive;
    }
  }

  return (
    <section data-company-forecasting className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{t("CompanySettings.forecasting.title")}</h2>

      <div className="flex flex-col gap-1.5">
        <FormSelect
          id="dealWeightingColumnId"
          items={columnItems}
          label={t("CompanySettings.forecasting.columnLabel")}
          optionsLoading={store.isLoadingDealStageColumns}
          placeholder={t("CompanySettings.forecasting.columnPlaceholder")}
          onValueChange={(value) => {
            if (!value) return;

            store.setDealWeightingColumn(value === NO_COLUMN_VALUE ? null : value);
          }}
        />

        <p className="text-subdued text-xs">
          {t("CompanySettings.forecasting.description", { deal: singular(EntityType.deal) })}
        </p>
      </div>

      {body}

      {state === "content" && (
        <div className="flex flex-col gap-1.5">
          <InfoRow label={t("CompanySettings.forecasting.totalPipeline")}>
            <span className="text-x-md font-mono tabular-nums">
              {intlStore.formatCurrency(store.pipelineTotal, store.form.currency)}
            </span>
          </InfoRow>

          <InfoRow label={t("CompanySettings.forecasting.currentTotal")}>
            <span className="text-x-md font-mono tabular-nums">
              {intlStore.formatCurrency(store.weightedPipelineTotal, store.form.currency)}
            </span>
          </InfoRow>

          {store.unweightedPipelineTotal > 0 && (
            <InfoRow
              label={t("CompanySettings.forecasting.withoutStage", { column: store.selectedStageColumn?.label ?? "" })}
            >
              <span className="text-x-md text-subdued font-mono tabular-nums">
                {intlStore.formatCurrency(store.unweightedPipelineTotal, store.form.currency)}
              </span>
            </InfoRow>
          )}
        </div>
      )}
    </section>
  );
});
