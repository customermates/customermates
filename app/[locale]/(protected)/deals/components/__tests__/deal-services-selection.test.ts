import type { ComponentType, ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const dealDetailStore = vi.hoisted(() => ({
  form: { services: [] as Array<{ quantity?: number; serviceId?: string }> },
  fetchedEntity: { id: "deal-1", services: [] as Array<{ id: string }> },
  canManage: true,
  addService: vi.fn(),
  deleteService: vi.fn(),
  serviceAmountById: new Map<string, number>(),
  totalQuantity: 0,
  totalValue: 0,
  weightedValueBreakdown: null,
  searchServiceOptions: vi.fn(),
  createServiceOption: vi.fn(),
}));

vi.mock("mobx-react-lite", () => ({
  observer: <T extends ComponentType<any>>(component: T) => component,
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: { entity?: string }) =>
    ({
      "Common.actions.delete": "Delete",
      "Common.actions.openList": "Open list",
      "Common.inputs.addService": "Add service",
      "DealModal.noServicesAdded": `No ${values?.entity ?? "services"} added`,
      "DealModal.quantityLabel": "Quantity",
      "DealModal.valueLabel": "Value",
      "EntityDetail.starField": `Show ${values?.entity ?? "Services"} in the overview`,
      "EntityDetail.unstarField": `Remove ${values?.entity ?? "Services"} from the overview`,
    })[key] ?? key,
}));

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  TooltipTrigger: ({ children }: { children: ReactNode }) => createElement("span", null, children),
  TooltipContent: ({ children }: { children: ReactNode }) => createElement("span", null, children),
}));

vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children),
}));

vi.mock("@/components/entity-detail/entity-detail-personalization", () => ({
  useEntityDetailPersonalization: () => ({
    enabled: true,
    starredFieldIds: [],
    toggleStarredField: vi.fn(),
  }),
}));

vi.mock("@/components/entity-detail/hooks/use-entity-drawer-stack", () => ({
  useEntityHref: () => vi.fn(),
}));

vi.mock("@/components/entity-terminology/use-column-label", () => ({
  useColumnLabel: () => (field: string) => field,
}));

vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({
    plural: (entityType: string) => `${entityType[0].toUpperCase()}${entityType.slice(1)}s`,
  }),
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    dealDetailStore,
    userStore: { canAccess: () => true },
  }),
}));

vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatCurrency: (value: number) => `€${value}`,
    formatNumber: (value: number) => String(value),
  }),
}));

import { DealServicesSelection } from "../deal-services-selection";

describe("DealServicesSelection relation actions", () => {
  it("renders favorite and go-to actions together on the page detail row", () => {
    const markup = renderToStaticMarkup(
      createElement(DealServicesSelection, {
        personalization: { fieldId: "serviceIds", label: "Services" },
        showTotals: false,
      }),
    );

    expect(markup).toContain('aria-label="Show Services in the overview"');
    expect(markup).toContain('aria-label="Open list"');
    expect(markup).toContain('href="/services?filters=dealIds%3Ain%3Adeal-1"');
  });

  it("keeps the go-to action in the drawer without exposing personalization", () => {
    const markup = renderToStaticMarkup(createElement(DealServicesSelection));

    expect(markup).not.toContain("overview");
    expect(markup).toContain('aria-label="Open list"');
  });
});
