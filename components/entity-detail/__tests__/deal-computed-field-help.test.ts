import type { ComponentType, ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type StaticFieldProps = {
  fieldId: string;
  help?: ReactNode;
  label: string;
  value: ReactNode;
};

const harness = vi.hoisted(() => ({
  staticFields: [] as StaticFieldProps[],
  translationCalls: [] as Array<{ key: string; values?: Record<string, string | number> }>,
  weightedValueBreakdown: null as {
    percent: number;
    stage: string;
    weightedValue: number;
  } | null,
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

vi.mock("@/components/data-view/custom-columns/custom-field-inputs", () => ({
  CustomFieldInputs: () => null,
}));
vi.mock("@/components/entity-detail/entity-detail-body", () => ({
  EntityDetailBody: ({ children }: { children: ReactNode }) => createElement("main", null, children),
}));
vi.mock("@/components/entity-detail/entity-detail-custom-fields-section", () => ({
  EntityDetailCustomFieldsSection: () => null,
}));
vi.mock("@/components/entity-detail/entity-detail-section", () => ({
  EntityDetailSection: ({ children }: { children: ReactNode }) => createElement("section", null, children),
  EntityDetailSectionGroup: ({ children }: { children: ReactNode }) => createElement("div", null, children),
}));
vi.mock("@/components/entity-detail/entity-detail-pin-button", () => ({
  EntityDetailPinButton: () => null,
}));
vi.mock("@/components/entity-detail/entity-detail-static-field", () => ({
  EntityDetailStaticField: (props: StaticFieldProps) => {
    harness.staticFields.push(props);
    return null;
  },
}));
vi.mock("@/components/entity-detail/relation-fields", () => ({
  AssignedUsersField: () => null,
  EntityRelationField: () => null,
}));
vi.mock("@/components/entity-terminology/use-column-label", () => ({
  useColumnLabel: () => (field: string) => `label:${field}`,
}));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({
    plural: (entityType: string) => `${entityType}s`,
    singular: (entityType: string) => entityType,
  }),
}));
vi.mock("@/components/forms/form-input", () => ({ FormInput: () => null }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    dealDetailStore: {
      canManage: true,
      customColumns: [],
      fetchedEntity: {
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        id: "deal-1",
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
      isEditingCustomField: false,
      totalQuantity: 7,
      totalValue: 12_500,
      get weightedValueBreakdown() {
        return harness.weightedValueBreakdown;
      },
    },
  }),
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatCurrency: (value: number) => `currency:${value}`,
    formatNumber: (value: number) => `number:${value}`,
    formatNumericalShortDateTime: (value: Date) => `date:${value.toISOString()}`,
  }),
}));
vi.mock("@/app/[locale]/(protected)/deals/components/deal-services-selection", () => ({
  DealServicesSelection: () => null,
}));

import { DealDetailView } from "@/app/[locale]/(protected)/deals/components/deal-detail-view";

function renderPage() {
  renderToStaticMarkup(createElement(DealDetailView, { layout: "page" }));
  return new Map(harness.staticFields.map((field) => [field.fieldId, field]));
}

beforeEach(() => {
  harness.staticFields.length = 0;
  harness.translationCalls.length = 0;
  harness.weightedValueBreakdown = null;
});

describe("DealDetailView computed field help", () => {
  it("passes focused explanations and formatted values to every computed field", () => {
    harness.weightedValueBreakdown = {
      percent: 40,
      stage: "Qualified",
      weightedValue: 5_000,
    };

    const fields = renderPage();

    expect(fields.get("totalValue")).toMatchObject({
      help: "EntityDetail.computedFieldHelp.dealValue",
      label: "label:totalValue",
      value: "currency:12500",
    });
    expect(fields.get("totalQuantity")).toMatchObject({
      help: "EntityDetail.computedFieldHelp.serviceQuantity",
      label: "label:totalQuantity",
      value: "number:7",
    });
    expect(fields.get("weightedValue")).toMatchObject({
      help: "EntityDetail.computedFieldHelp.weightedValue",
      label: "label:weightedValue",
      value: "currency:5000",
    });
    expect(fields.get("createdAt")?.help).toBeUndefined();
    expect(fields.get("updatedAt")?.help).toBeUndefined();

    expect(harness.translationCalls).toContainEqual({
      key: "EntityDetail.computedFieldHelp.dealValue",
      values: { services: "services" },
    });
    expect(harness.translationCalls).toContainEqual({
      key: "EntityDetail.computedFieldHelp.serviceQuantity",
      values: { services: "services" },
    });
    expect(harness.translationCalls).toContainEqual({
      key: "EntityDetail.computedFieldHelp.weightedValue",
      values: {
        company: "UserAvatar.company",
        dealValue: "label:totalValue",
        percent: 40,
        services: "services",
        stage: "Qualified",
      },
    });
  });

  it("uses a neutral explanation whenever no weighted-value breakdown is available", () => {
    const fields = renderPage();

    expect(fields.get("weightedValue")).toMatchObject({
      help: "EntityDetail.computedFieldHelp.weightedValueUnconfigured",
      label: "label:weightedValue",
      value: undefined,
    });
    expect(harness.translationCalls).toContainEqual({
      key: "EntityDetail.computedFieldHelp.weightedValueUnconfigured",
      values: {
        company: "UserAvatar.company",
        dealValue: "label:totalValue",
        services: "services",
      },
    });
  });
});
