import { beforeEach, describe, expect, it, vi } from "vitest";
import { AggregationType, EntityType, WidgetGroupByType, WidgetKind } from "@/generated/prisma";

import type { WidgetDto } from "@/features/widget/widget.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { RootStore } from "@/core/stores/root.store";

const { refreshWidgetsAction, updateWidgetLayoutsAction, captureException } = vi.hoisted(() => ({
  refreshWidgetsAction: vi.fn(),
  updateWidgetLayoutsAction: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("../../actions", () => ({
  refreshWidgetsAction,
  updateWidgetLayoutsAction,
}));

vi.mock("@sentry/nextjs", () => ({ captureException }));

vi.mock("@/app/actions", () => ({
  bulkDeleteEntitiesAction: vi.fn(),
  bulkUpdateCustomFieldValuesAction: vi.fn(),
  getCustomColumnsByEntityTypeAction: vi.fn(),
  updateEntityCustomFieldValueAction: vi.fn(),
  upsertP13nAction: vi.fn(),
}));

import { WidgetsStore } from "../widgets.store";
import { registerApplicationErrorHandler } from "@/core/errors/report-application-error";

const FIRST_ID = "00000000-0000-4000-8000-000000000001";
const SECOND_ID = "00000000-0000-4000-8000-000000000002";

function widget(id: string, x: number, y: number): WidgetDto {
  return {
    aggregationType: AggregationType.count,
    companyId: "company-1",
    createdAt: new Date(0),
    data: [],
    dealFilters: [],
    displayOptions: null,
    entityFilters: [],
    entityType: EntityType.contact,
    groupByCustomColumnId: null,
    groupByType: WidgetGroupByType.none,
    id,
    isTemplate: false,
    kind: WidgetKind.chart,
    layout: {
      lg: { h: 2, i: id, w: 3, x, y },
    },
    name: id,
    updatedAt: new Date(0),
    userId: "user-1",
  };
}

describe("WidgetsStore refresh compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rebuilds layouts through the setItems override and preserves custom columns", async () => {
    const root = {
      localeStore: { getTranslation: (key: string) => key },
      loadingOverlayStore: { isLoading: false },
    } as unknown as RootStore;
    const store = new WidgetsStore(root);
    const customColumns = [{ id: "custom-column" }] as CustomColumnDto[];

    store.setItems({ customColumns, items: [widget(FIRST_ID, 0, 0)] });
    refreshWidgetsAction.mockResolvedValueOnce([widget(SECOND_ID, 6, 4)]);

    await store.refresh();

    expect(store.items.map(({ id }) => id)).toEqual([SECOND_ID]);
    expect(store.customColumns).toEqual(customColumns);
    expect(store.layouts.lg).toEqual([{ h: 2, i: SECOND_ID, w: 3, x: 6, y: 4 }]);
    expect(store.layouts.lg).not.toEqual(expect.arrayContaining([expect.objectContaining({ i: FIRST_ID })]));
    expect(store.isReady).toBe(true);
    expect(store.isRefreshing).toBe(false);
    expect(store.dataRequest).toEqual({ status: "ready" });
  });

  it("reports a rejected layout write instead of leaving the dropped promise unhandled", async () => {
    const root = {
      localeStore: { getTranslation: (key: string) => key },
      loadingOverlayStore: { withLoading: (run: () => Promise<unknown>) => run() },
    } as unknown as RootStore;
    const store = new WidgetsStore(root);
    const initial = widget(FIRST_ID, 0, 0);
    refreshWidgetsAction.mockResolvedValueOnce([initial]);
    await store.refresh();

    const error = new Error("layout write failed");
    updateWidgetLayoutsAction.mockRejectedValueOnce(error);
    const seen: unknown[] = [];
    const unregister = registerApplicationErrorHandler((reported) => seen.push(reported));
    const before = JSON.parse(JSON.stringify(store.layouts)) as typeof store.layouts;
    const moved = {
      ...store.layouts,
      lg: [{ h: 2, i: FIRST_ID, w: 3, x: 1, y: 0 }],
    };

    store.onLayoutChange([], moved);

    await vi.waitFor(() => expect(seen).toEqual([error]));
    expect(updateWidgetLayoutsAction).toHaveBeenCalledTimes(1);
    expect(store.layouts).toEqual(before);
    expect(store.layouts).not.toEqual(moved);
    expect(captureException).toHaveBeenCalledExactlyOnceWith(error);
    unregister();
  });
});
