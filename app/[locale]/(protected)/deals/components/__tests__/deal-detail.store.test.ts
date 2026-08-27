import type { RootStore } from "@/core/stores/root.store";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { DealDto } from "@/features/deals/deal.schema";

import { describe, expect, it, vi } from "vitest";
import { Action, CustomColumnType, EntityType, Resource } from "@/generated/prisma";

const dealActions = vi.hoisted(() => ({
  getDealByIdAction: vi.fn(),
  createDealAction: vi.fn(),
  updateDealAction: vi.fn(),
  deleteDealAction: vi.fn(),
}));

vi.mock("../../actions", () => dealActions);
vi.mock("../../../services/actions", () => ({
  createServiceByNameAction: vi.fn(),
  getServicesAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { DealDetailStore } from "../deal-detail.store";

const DEAL_ID = "40000000-0000-4000-8000-000000000001";
const SERVICE_ID = "50000000-0000-4000-8000-000000000001";
const STAGE_COLUMN_ID = "60000000-0000-4000-8000-000000000001";

const stageColumn: CustomColumnDto = {
  id: STAGE_COLUMN_ID,
  entityType: EntityType.deal,
  label: "Stage",
  type: CustomColumnType.singleSelect,
  options: {
    options: [
      {
        color: "default",
        index: 0,
        isDefault: false,
        label: "Proposal",
        value: "proposal",
        weight: 50,
      },
    ],
  },
};

function deal(): DealDto {
  return {
    id: DEAL_ID,
    name: "Expansion",
    totalValue: 1_000,
    totalQuantity: 10,
    weightedValue: null,
    notes: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    organizations: [],
    users: [],
    contacts: [],
    services: [{ id: SERVICE_ID, name: "Visible service", amount: 100, quantity: 1 }],
    tasks: [],
    customFieldValues: [{ columnId: STAGE_COLUMN_ID, value: "proposal" }],
  };
}

function rootStore(canReadAllServices: boolean): RootStore {
  const dealsStore = {
    customColumns: [] as CustomColumnDto[],
    setCustomColumns: vi.fn((columns: CustomColumnDto[]) => {
      dealsStore.customColumns = columns;
    }),
    refreshCustomColumns: vi.fn(),
    upsertItem: vi.fn(),
    removeItem: vi.fn(),
  };

  return {
    registerModalStore: vi.fn(),
    dealsStore,
    companyStore: { company: { dealWeightingColumnId: STAGE_COLUMN_ID } },
    userStore: {
      user: { id: "user-1" },
      can: vi.fn((resource: Resource, action: Action) =>
        resource === Resource.services && action === Action.readAll ? canReadAllServices : true,
      ),
      canAccess: vi.fn(() => true),
      canManage: vi.fn(() => true),
    },
    loadingOverlayStore: { withLoading: (fn: () => unknown) => fn() },
    globalSearchModalStore: {
      pushRecentItem: vi.fn(),
      removeRecentItem: vi.fn(),
    },
    localeStore: { locale: "en", getTranslation: (key: string) => key },
  } as unknown as RootStore;
}

describe("DealDetailStore totals", () => {
  it("keeps authoritative totals when service relations are permission-filtered", () => {
    const store = new DealDetailStore(rootStore(false));

    store.hydrate(deal(), [stageColumn]);

    expect(store.totalValue).toBe(1_000);
    expect(store.totalQuantity).toBe(10);
    expect(store.weightedValueBreakdown).toMatchObject({
      value: 1_000,
      weightedValue: 500,
      percent: 50,
      stage: "Proposal",
    });
  });

  it("previews live totals when the complete service relation is available", () => {
    const store = new DealDetailStore(rootStore(true));

    store.hydrate(deal(), [stageColumn]);

    expect(store.totalValue).toBe(100);
    expect(store.totalQuantity).toBe(1);
    expect(store.weightedValueBreakdown?.weightedValue).toBe(50);
  });
});
