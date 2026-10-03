import type * as EntityDetailOverviewModule from "../entity-detail-overview";
import type * as EntityDetailPersonalizationModule from "../entity-detail-personalization";
import type { ComponentType, ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { EntityDetailPersonalizationConfig } from "../entity-detail-personalization";
import type { P13nEntry } from "@/features/p13n/prisma-p13n.repository";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomColumnType, EntityType } from "@/generated/prisma";

const upsert = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions", () => ({ upsertP13nAction: upsert }));
vi.mock("@/core/errors/report-application-error", () => ({ reportApplicationError: vi.fn() }));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn() }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ customColumnModalStore: { initialize: vi.fn(), open: vi.fn() } }),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("../entity-detail-field-actions", () => ({ EntityDetailFieldActions: () => null }));
vi.mock("@/components/data-view/custom-columns/custom-field-value-input", () => ({
  CustomFieldValueInput: ({ column, index }: { column: CustomColumnDto; index: number }) =>
    createElement("input", { "data-custom-index": index, "data-column-id": column.id, defaultValue: column.label }),
}));

const firstId = "10000000-0000-4000-8000-000000000001";
const secondId = "10000000-0000-4000-8000-000000000002";
const columns: CustomColumnDto[] = [firstId, secondId].map((id, index) => ({
  id,
  label: `Custom ${index}`,
  type: CustomColumnType.plain,
  entityType: EntityType.deal,
}));
const fields = ["name", "createdAt", "updatedAt"].map((id) => ({
  id,
  content: createElement("input", { "data-standard-id": id, defaultValue: id }),
}));
type TestProviderProps = {
  children?: ReactNode;
  config: EntityDetailPersonalizationConfig;
  customColumnIds: string[];
  initial: P13nEntry;
  persistenceScope: string;
};
let root: Root | undefined;

function Controls() {
  const { reorderFields } = useEntityDetailPersonalization();
  return createElement("button", {
    "data-reorder": true,
    onClick: () => reorderFields([firstId, "name", secondId, "createdAt", "updatedAt"]),
  });
}

let EntityDetailOverview: typeof EntityDetailOverviewModule.EntityDetailOverview;
let TestProvider: ComponentType<TestProviderProps>;
let EntityDetailPersonalizationProvider: typeof EntityDetailPersonalizationModule.EntityDetailPersonalizationProvider;
let useEntityDetailPersonalization: typeof EntityDetailPersonalizationModule.useEntityDetailPersonalization;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetModules();
  ({ EntityDetailOverview } = await import("../entity-detail-overview"));
  ({ EntityDetailPersonalizationProvider, useEntityDetailPersonalization } = await import(
    "../entity-detail-personalization"
  ));
  TestProvider = EntityDetailPersonalizationProvider as ComponentType<TestProviderProps>;
  upsert.mockReset().mockResolvedValue({ ok: true, data: {} });
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

describe("continuous entity overview", () => {
  it("ignores legacy collapsed sections and keeps both custom and standard inputs directly visible", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root?.render(
        createElement(
          TestProvider,
          {
            config: {
              p13nId: "deal-detail",
              defaultStarredFieldIds: [],
              availableFieldIds: ["name", firstId, secondId, "createdAt", "updatedAt"],
            },
            customColumnIds: [firstId, secondId],
            persistenceScope: "user-1",
            initial: {
              p13nId: "deal-detail",
              columnOrder: [secondId, firstId],
              detailOptions: {
                starredFieldIds: [],
                collapsedSectionIds: ["base", "customFields"],
                fieldOrder: ["name", "createdAt", "updatedAt"],
              },
            },
          },
          createElement(Controls),
          createElement(EntityDetailOverview, {
            canManage: false,
            columns,
            entityType: EntityType.deal,
            fields,
            isEditing: false,
            onToggleEditing: vi.fn(),
          }),
        ),
      ),
    );
    const order = () =>
      Array.from(container.querySelectorAll("[data-sortable-field]"), (element) =>
        element.getAttribute("data-sortable-field"),
      );
    expect(order()).toEqual(["name", secondId, firstId, "createdAt", "updatedAt"]);
    expect(container.querySelectorAll("[data-detail-field-list]")).toHaveLength(1);
    expect(container.querySelector("[data-slot='accordion'], [data-detail-section-trigger], h3")).toBeNull();
    expect(upsert).not.toHaveBeenCalled();
    const input = container.querySelector<HTMLInputElement>(`[data-column-id="${firstId}"]`);
    if (!input) throw new Error("Expected the custom input");
    input.value = "Unsaved custom draft";
    act(() => container.querySelector<HTMLButtonElement>("[data-reorder]")?.click());
    expect(order()).toEqual([firstId, "name", secondId, "createdAt", "updatedAt"]);
    expect(container.querySelector(`[data-column-id="${firstId}"]`)).toBe(input);
    expect(input.value).toBe("Unsaved custom draft");
    expect(input.dataset.customIndex).toBe("0");
    expect(container.querySelector<HTMLElement>(`[data-column-id="${secondId}"]`)?.dataset.customIndex).toBe("1");
    act(() => root?.unmount());
    root = undefined;
    await act(async () => Promise.resolve());
    expect(upsert).toHaveBeenCalledExactlyOnceWith({
      p13nId: "deal-detail",
      columnOrder: [firstId, secondId],
      detailOptions: {
        starredFieldIds: [],
        collapsedSectionIds: [],
        fieldOrder: [firstId, "name", secondId, "createdAt", "updatedAt"],
      },
    });
  });
});
