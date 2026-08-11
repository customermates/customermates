import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ViewMode } from "@/core/base/base-query-builder";

import type { BaseDataViewStore } from "@/core/base/base-data-view.store";

const harness = vi.hoisted(() => ({
  content: vi.fn(() => "legacy-content"),
  empty: vi.fn(({ reason }: { reason: string }) => reason),
  layout: vi.fn(({ children }: { children: string }) => children),
  setTopBar: vi.fn(),
}));

vi.mock("mobx-react-lite", () => ({ observer: <T>(component: T) => component }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/app/components/topbar-actions-context", () => ({ useSetTopBarActions: harness.setTopBar }));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ singular: () => "record" }),
}));
vi.mock("../data-view-content", () => ({ DataViewContent: harness.content }));
vi.mock("../data-view-empty", () => ({ DataViewEmpty: harness.empty }));
vi.mock("../data-view-layout", () => ({ DataViewLayout: harness.layout }));

import { DataViewContainer } from "../data-view-container";

type Item = { id: string };

describe("DataViewContainer compatibility adapter", () => {
  it("delegates loaded legacy routes to the extracted layout and content owners", () => {
    const store = {
      dataRequest: { status: "ready" },
      filters: [],
      groupingColumnId: null,
      isReady: true,
      isRefreshing: false,
      items: [{ id: "record-1" }],
      pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 },
      refreshError: null,
      searchTerm: "",
      viewMode: ViewMode.table,
    } as unknown as BaseDataViewStore<Item>;

    const html = renderToStaticMarkup(createElement(DataViewContainer<Item>, { columns: [], store }));

    expect(html).toContain("legacy-content");
    expect(harness.layout).toHaveBeenCalledWith(expect.objectContaining({ showPagination: true }), undefined);
    expect(harness.content).toHaveBeenCalledWith(expect.objectContaining({ store, view: "table" }), undefined);
    expect(harness.setTopBar).toHaveBeenCalledOnce();
  });

  it("preserves legacy empty rendering after a failed refresh with no rows", () => {
    const store = {
      dataRequest: { status: "refresh-error", error: new Error("offline") },
      filters: [],
      groupingColumnId: null,
      isReady: true,
      isRefreshing: false,
      items: [],
      pagination: { page: 1, pageSize: 25, total: 0, totalPages: 0 },
      refreshError: new Error("offline"),
      searchTerm: "",
      viewMode: ViewMode.table,
    } as unknown as BaseDataViewStore<Item>;

    const html = renderToStaticMarkup(createElement(DataViewContainer<Item>, { columns: [], store }));

    expect(html).toContain("true-empty");
    expect(harness.empty).toHaveBeenCalledWith(expect.objectContaining({ reason: "true-empty" }), undefined);
  });
});
