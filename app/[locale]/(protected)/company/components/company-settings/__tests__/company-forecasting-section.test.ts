import type { ComponentType, ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  outputs: [] as Array<{ help?: ReactNode; label: string; children: ReactNode }>,
  selects: [] as Array<{ id: string; value?: string; items?: Array<{ value: string; label: string }> }>,
  translationCalls: [] as Array<{ key: string; values?: Record<string, string | number> }>,
}));

const store = vi.hoisted(() => ({
  dealStageColumns: [{ id: "stage-column", label: "Stage", options: [{ value: "qualified", label: "Qualified" }] }],
  form: {
    currency: "eur",
    dealStageWeights: [{ optionValue: "qualified", weight: 40 }],
    dealWeightingColumnId: "stage-column" as string | null,
  },
  forecastingRequest: "ready",
  isLoadingDealStageColumns: false,
  pipelineTotal: 12_000,
  selectedStageColumn: {
    id: "stage-column",
    label: "Stage",
    options: [{ value: "qualified", label: "Qualified" }],
  },
  selectedStageValueSums: { qualified: { totalValue: 10_000 }, __empty__: { totalValue: 2_000 } },
  setDealWeightingColumn: vi.fn(),
  unweightedPipelineTotal: 2_000,
  weightedPipelineTotal: 4_000,
}));

vi.mock("mobx-react-lite", () => ({
  observer: <T extends ComponentType<any>>(component: T) => component,
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    harness.translationCalls.push({ key, values });
    return key;
  },
}));

vi.mock("@/components/chip/app-chip", () => ({
  AppChip: ({ children }: { children: ReactNode }) => createElement("span", null, children),
}));
vi.mock("@/components/forms/form-number-input", () => ({ FormNumberInput: () => null }));
vi.mock("@/components/forms/form-select", () => ({
  FormSelect: (props: { id: string; value?: string; items?: Array<{ value: string; label: string }> }) => {
    harness.selects.push(props);
    return null;
  },
}));
vi.mock("@/components/forms/form-output-field", () => ({
  FormOutputField: (props: { help?: ReactNode; label: string; children: ReactNode }) => {
    harness.outputs.push(props);
    return createElement("div", { "data-output": props.label }, props.children);
  },
}));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({
    plural: (entityType: string) => `${entityType}s`,
    singular: (entityType: string) => entityType,
  }),
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ companySettingsStore: store }),
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatCurrency: (value: number) => `currency:${value}`,
  }),
}));

import { CompanyForecastingSection } from "../company-forecasting-section";

const stageColumn = store.dealStageColumns[0];

beforeEach(() => {
  harness.outputs.length = 0;
  harness.selects.length = 0;
  harness.translationCalls.length = 0;
  store.form.dealWeightingColumnId = "stage-column";
  store.forecastingRequest = "ready";
  store.isLoadingDealStageColumns = false;
  store.dealStageColumns = [stageColumn];
});

describe("CompanyForecastingSection deal stage field", () => {
  function stageFieldSelect() {
    renderToStaticMarkup(createElement(CompanyForecastingSection));
    const select = harness.selects.find(({ id }) => id === "dealWeightingColumnId");
    if (!select) throw new Error("Expected the deal stage field select");
    return select;
  }

  it("shows Not configured as the chosen item when weighting is off", () => {
    store.form.dealWeightingColumnId = null;

    const select = stageFieldSelect();

    expect(select.items?.find(({ value }) => value === select.value)?.label).toBe(
      "CompanySettings.forecasting.noColumn",
    );
  });

  it("shows the configured stage field as the chosen item", () => {
    const select = stageFieldSelect();

    expect(select.value).toBe("stage-column");
    expect(select.items?.find(({ value }) => value === select.value)?.label).toBe("Stage");
  });

  it("does not claim Not configured while the deal columns are still loading", () => {
    store.form.dealWeightingColumnId = null;
    store.forecastingRequest = "loading";
    store.isLoadingDealStageColumns = true;
    store.dealStageColumns = [];

    expect(stageFieldSelect().value).toBeUndefined();
  });

  it("does not claim Not configured when the deal columns fail to load", () => {
    store.form.dealWeightingColumnId = null;
    store.forecastingRequest = "error";
    store.dealStageColumns = [];

    expect(stageFieldSelect().value).toBeUndefined();
  });

  it("shows Not configured when it is chosen after the stage totals fail to load", () => {
    store.form.dealWeightingColumnId = null;
    store.forecastingRequest = "error";

    const select = stageFieldSelect();

    expect(select.items?.find(({ value }) => value === select.value)?.label).toBe(
      "CompanySettings.forecasting.noColumn",
    );
  });
});

describe("CompanyForecastingSection computed outputs", () => {
  it("explains every total with its calculation and change path", () => {
    const markup = renderToStaticMarkup(createElement(CompanyForecastingSection));

    expect(markup).toContain("currency:12000");
    expect(markup).toContain("currency:4000");
    expect(markup).toContain("currency:2000");
    expect(harness.outputs.map(({ label }) => label)).toEqual([
      "CompanySettings.forecasting.totalPipeline",
      "CompanySettings.forecasting.currentTotal",
      "CompanySettings.forecasting.withoutStage",
    ]);
    expect(harness.translationCalls).toContainEqual({
      key: "CompanySettings.forecasting.totalPipelineHelp",
      values: { deals: "deals", services: "services" },
    });
    expect(harness.translationCalls).toContainEqual({
      key: "CompanySettings.forecasting.currentTotalHelp",
      values: { deals: "deals", services: "services" },
    });
    expect(harness.translationCalls).toContainEqual({
      key: "CompanySettings.forecasting.withoutStageHelp",
      values: { column: "Stage", deals: "deals" },
    });
  });
});
