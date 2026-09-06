import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ColumnDef } from "@tanstack/react-table";
import type { BaseDataViewStore } from "@/core/base/base-data-view.store";

const harness = vi.hoisted(() => ({
  kanban: vi.fn((_props: { className?: string }) => "board-view"),
  pagination: vi.fn(() => "pagination"),
  table: vi.fn((_props: { className?: string }) => "table-view"),
}));

vi.mock("mobx-react-lite", () => ({ observer: <T>(component: T) => component }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/entity-terminology/use-column-label", () => ({
  useColumnLabel: () => (id: string) => id,
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ terminologyStore: { overrides: {} } }),
}));
vi.mock("../data-kanban-view", () => ({ DataKanbanView: harness.kanban }));
vi.mock("../data-table", () => ({ DataTable: harness.table }));
vi.mock("../header/pagination", () => ({ DataViewPagination: harness.pagination }));
vi.mock("../mass-actions-bar", () => ({ MassActionsBar: () => null }));
vi.mock("../views/data-view-views-rail", () => ({ DataViewViewsRail: () => "views-rail" }));

import { DataViewContent } from "../data-view-content";
import { DataViewLayout } from "../data-view-layout";

type Item = { id: string; name: string };

function store(): BaseDataViewStore<Item> {
  return {
    items: [],
    orderedColumns: [{ uid: "name" }],
    sortableColumnIds: new Set(["name"]),
  } as unknown as BaseDataViewStore<Item>;
}

describe("data-view presentation composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps pagination in the layout and renders it only when requested", () => {
    const dataStore = store();
    const withPagination = renderToStaticMarkup(
      createElement(
        DataViewLayout<Item>,
        { showPagination: true, store: dataStore } as Parameters<typeof DataViewLayout<Item>>[0],
        "content",
      ),
    );

    expect(withPagination).toContain("content");
    expect(withPagination).toContain("views-rail");
    expect(withPagination.indexOf("views-rail")).toBeLessThan(withPagination.indexOf("content"));
    expect(withPagination).toContain('style="contain:layout"');
    expect(withPagination).toContain("pagination");
    expect(harness.pagination).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    const withoutPagination = renderToStaticMarkup(
      createElement(
        DataViewLayout<Item>,
        { showPagination: false, store: dataStore } as Parameters<typeof DataViewLayout<Item>>[0],
        "content",
      ),
    );

    expect(withoutPagination).not.toContain("pagination");
    expect(harness.pagination).not.toHaveBeenCalled();
  });

  it.each([
    ["table", harness.table],
    ["board", harness.kanban],
  ] as const)("renders only the selected %s content owner", (view, owner) => {
    const onRowClick = vi.fn();
    const rowHref = vi.fn(() => "/contacts/contact-1");
    const columns = [{ id: "name" }] as ColumnDef<Item>[];

    const html = renderToStaticMarkup(
      createElement(DataViewContent<Item>, {
        columns,
        onRowClick,
        rowHref,
        store: store(),
        view,
      }),
    );

    expect(html).toContain(`${view}-view`);
    expect(owner).toHaveBeenCalledOnce();
    expect(owner.mock.lastCall?.[0].className).toContain("animate-page-result-in");
    expect(owner.mock.lastCall?.[0].className).toContain("motion-reduce:animate-none");
  });
});
