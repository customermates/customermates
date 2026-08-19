import type { FormEvent } from "react";
import type { RootStore } from "@/core/stores/root.store";
import type { GroupValueSums } from "@/core/base/base-get.schema";
import type { CustomColumnDto, CustomColumnOption } from "@/features/custom-column/custom-column.schema";
import type { ForecastingRequestStatus } from "./company-forecasting-state";
import type {
  EntityTerminologyOverride,
  TerminologySelectionMap,
} from "@/features/entity-terminology/entity-terminology.types";

import { action, computed, makeObservable, observable, toJS } from "mobx";
import { cloneDeep } from "lodash";
import equal from "fast-deep-equal/es6";
import { Currency, CustomColumnType, EntityType, Resource } from "@/generated/prisma";

import { KANBAN_EMPTY_GROUP_KEY } from "@/core/base/base-get.schema";
import { DEAL_GROUP_SUM_FIELDS } from "@/features/deals/deal-weighting";

import { getCustomColumnsByEntityTypeAction } from "@/app/actions";

import { getDealStageValueSumsAction, updateCompanyAction } from "../../actions";

import { BaseFormStore } from "@/core/base/base-form.store";
import {
  defaultTerminologySelections,
  isTerminologyPresetKey,
  terminologySelectionsFromOverrides,
  terminologySelectionsToEntries,
} from "@/features/entity-terminology/entity-terminology.constants";

export type DealStageColumn = {
  id: string;
  label: string;
  options: CustomColumnOption[];
};

type DealStageWeightDraft = {
  optionValue: string;
  weight: number | undefined;
};

type CompanySettingsFormData = {
  currency: Currency;
  terminology: TerminologySelectionMap;
  dealWeightingColumnId: string | null;
  dealStageWeights: DealStageWeightDraft[];
};

function toDealStageColumns(customColumns: CustomColumnDto[]): DealStageColumn[] {
  return customColumns.flatMap((column) =>
    column.type === CustomColumnType.singleSelect
      ? [
          {
            id: column.id,
            label: column.label,
            options: [...column.options.options].sort((first, second) => first.index - second.index),
          },
        ]
      : [],
  );
}

export class CompanySettingsStore extends BaseFormStore<CompanySettingsFormData> {
  public dealStageColumns: DealStageColumn[] = [];
  public stageValueSumsByColumnId: Record<string, Record<string, GroupValueSums>> = {};
  public forecastingRequest: ForecastingRequestStatus = "uninitialized";

  constructor(rootStore: RootStore) {
    super(
      rootStore,
      {
        currency: Currency.eur,
        terminology: defaultTerminologySelections(),
        dealWeightingColumnId: null,
        dealStageWeights: [],
      },
      Resource.company,
    );

    makeObservable(this, {
      dealStageColumns: observable,
      stageValueSumsByColumnId: observable,
      forecastingRequest: observable,
      isLoadingDealStageColumns: computed,
      selectedStageColumn: computed,
      selectedStageValueSums: computed,
      pipelineTotal: computed,
      unweightedPipelineTotal: computed,
      weightedPipelineTotal: computed,
      hasForecastingChanges: computed,
      onSubmit: action,
      initTerminology: action,
      setTerminologyPreset: action,
      setForecastingRequest: action,
      applyDealStageColumns: action,
      applyStageValueSums: action,
      setDealWeightingColumn: action,
    });
  }

  get isLoadingDealStageColumns(): boolean {
    return this.forecastingRequest === "uninitialized" || this.forecastingRequest === "loading";
  }

  get selectedStageColumn(): DealStageColumn | undefined {
    const columnId = this.form.dealWeightingColumnId;
    if (!columnId) return undefined;

    return this.dealStageColumns.find((column) => column.id === columnId);
  }

  get selectedStageValueSums(): Record<string, GroupValueSums> | undefined {
    const columnId = this.form.dealWeightingColumnId;
    if (!columnId) return undefined;

    return this.stageValueSumsByColumnId[columnId];
  }

  get pipelineTotal(): number {
    const stageValueSums = this.selectedStageValueSums;
    if (!stageValueSums) return 0;

    return (
      this.form.dealStageWeights.reduce(
        (total, { optionValue }) => total + (stageValueSums[optionValue]?.[DEAL_GROUP_SUM_FIELDS.total] ?? 0),
        0,
      ) + this.unweightedPipelineTotal
    );
  }

  get unweightedPipelineTotal(): number {
    const stageValueSums = this.selectedStageValueSums;
    if (!stageValueSums) return 0;

    return stageValueSums[KANBAN_EMPTY_GROUP_KEY]?.[DEAL_GROUP_SUM_FIELDS.total] ?? 0;
  }

  get weightedPipelineTotal(): number {
    const stageValueSums = this.selectedStageValueSums;
    if (!stageValueSums) return 0;

    return this.form.dealStageWeights.reduce(
      (total, { optionValue, weight }) =>
        total + ((stageValueSums[optionValue]?.[DEAL_GROUP_SUM_FIELDS.total] ?? 0) * (weight ?? 0)) / 100,
      0,
    );
  }

  get hasForecastingChanges(): boolean {
    return (
      this.form.dealWeightingColumnId !== this.savedState.dealWeightingColumnId ||
      !equal(this.form.dealStageWeights, this.savedState.dealStageWeights)
    );
  }

  initTerminology = (overrides: EntityTerminologyOverride[]) => {
    const terminology = terminologySelectionsFromOverrides(overrides);
    this.form = { ...this.form, terminology };
    this.savedState = { ...this.savedState, terminology: cloneDeep(terminology) };
  };

  setTerminologyPreset = (entityType: EntityType, presetKey: string) => {
    if (!isTerminologyPresetKey(entityType, presetKey)) return;

    this.form = { ...this.form, terminology: { ...this.form.terminology, [entityType]: presetKey } };
  };

  setForecastingRequest = (forecastingRequest: ForecastingRequestStatus) => {
    this.forecastingRequest = forecastingRequest;
  };

  applyDealStageColumns = (dealStageColumns: DealStageColumn[], dealWeightingColumnId: string | null) => {
    this.dealStageColumns = dealStageColumns;

    const dealStageWeights = this.stageWeightsFor(dealWeightingColumnId);

    this.form = { ...this.form, dealWeightingColumnId, dealStageWeights };
    this.savedState = { ...this.savedState, dealWeightingColumnId, dealStageWeights: cloneDeep(dealStageWeights) };
  };

  applyStageValueSums = (columnId: string, stageValueSums: Record<string, GroupValueSums>) => {
    this.stageValueSumsByColumnId = { ...this.stageValueSumsByColumnId, [columnId]: stageValueSums };
    this.forecastingRequest = "ready";
  };

  setDealWeightingColumn = (dealWeightingColumnId: string | null) => {
    this.form = {
      ...this.form,
      dealWeightingColumnId,
      dealStageWeights: this.stageWeightsFor(dealWeightingColumnId),
    };

    if (!dealWeightingColumnId) return;

    if (this.stageValueSumsByColumnId[dealWeightingColumnId]) this.setForecastingRequest("ready");
    else void this.loadStageValueSums(dealWeightingColumnId);
  };

  loadForecasting = async (dealWeightingColumnId: string | null) => {
    this.setForecastingRequest("loading");

    try {
      const dealStageColumns = toDealStageColumns(
        await getCustomColumnsByEntityTypeAction({ entityType: EntityType.deal }),
      );
      const selectedColumnId = dealStageColumns.some((column) => column.id === dealWeightingColumnId)
        ? dealWeightingColumnId
        : null;

      this.applyDealStageColumns(dealStageColumns, selectedColumnId);

      if (selectedColumnId) await this.loadStageValueSums(selectedColumnId);
      else this.setForecastingRequest("ready");
    } catch {
      this.setForecastingRequest("error");
    }
  };

  onSubmit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    this.setIsLoading(true);

    const forecastingChanged = this.hasForecastingChanges;

    try {
      const result = await updateCompanyAction({
        currency: this.form.currency,
        terminology: terminologySelectionsToEntries(this.form.terminology),
        ...(forecastingChanged
          ? {
              dealWeightingColumnId: this.form.dealWeightingColumnId,
              dealStageWeights: this.form.dealStageWeights.map(({ optionValue, weight }) => ({
                optionValue,
                weight: weight ?? 0,
              })),
            }
          : {}),
      });

      if (result.ok) {
        const company = this.rootStore.companyStore.company;
        if (company) this.rootStore.companyStore.setCompany({ ...company, currency: this.form.currency });

        await this.rootStore.terminologyStore.refresh();
        this.onInitOrRefresh({
          currency: this.form.currency,
          terminology: toJS(this.form.terminology),
          dealWeightingColumnId: this.form.dealWeightingColumnId,
          dealStageWeights: toJS(this.form.dealStageWeights),
        });
      } else this.setError(result.error);
    } finally {
      this.setIsLoading(false);
    }
  };

  private stageWeightsFor = (columnId: string | null): DealStageWeightDraft[] => {
    const column = this.dealStageColumns.find((entry) => entry.id === columnId);
    if (!column) return [];

    return column.options.map((option) => ({ optionValue: option.value, weight: option.weight ?? 0 }));
  };

  private loadStageValueSums = async (columnId: string) => {
    try {
      const result = await getDealStageValueSumsAction(columnId);

      if (result.ok) this.applyStageValueSums(columnId, result.data);
      else this.setForecastingRequest("error");
    } catch {
      this.setForecastingRequest("error");
    }
  };
}
