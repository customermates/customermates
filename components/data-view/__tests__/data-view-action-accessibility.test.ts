import type { ColumnDef } from "@tanstack/react-table";
import type { BaseDataViewStore } from "@/core/base/base-data-view.store";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("mobx-react-lite", () => ({
  observer: <T>(component: T) => component,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/components/entity-detail/hooks/use-entity-drawer-stack", () => ({
  useNavigateToHref: () => vi.fn(),
}));
vi.mock("../header/display-options", () => ({
  DataViewDisplayOptions: () => null,
}));
vi.mock("../header/filter-popover", () => ({ FilterPopover: () => null }));
vi.mock("../header/search", () => ({ DataViewSearch: () => null }));

import { DataTable } from "../data-table";
import { DataViewToolbar } from "../data-view-toolbar";

type Item = { id: string; name: string };

function store(): BaseDataViewStore<Item> {
  return {
    canExport: false,
    columnWidths: {},
    columnsDefinition: [{ uid: "name" }],
    entityType: undefined,
    hiddenColumns: [],
    isDisabled: false,
    isItemSelectable: () => true,
    isReady: true,
    items: [{ id: "routine-1", name: "Daily summary" }],
    selectedIds: new Set(),
    setPageSelection: vi.fn(),
    setQueryOptions: vi.fn(),
    setViewOptions: vi.fn(),
    sortDescriptor: undefined,
    toggleItemSelection: vi.fn(),
  } as unknown as BaseDataViewStore<Item>;
}

describe("data-view action accessibility", () => {
  it("exposes a native keyboard action in the name cell for click-only rows", () => {
    const columns: ColumnDef<Item>[] = [
      {
        accessorKey: "name",
        enableResizing: false,
        enableSorting: false,
        header: "Name",
        id: "name",
      },
    ];

    const html = renderToStaticMarkup(
      createElement(DataTable<Item>, {
        columns,
        onRowClick: vi.fn(),
        store: store(),
      }),
    );

    expect(html).toContain('<button class="');
    expect(html).toContain('data-slot="data-row-open"');
    expect(html).toContain('type="button"');
    expect(html).toContain("Daily summary");
  });

  it("keeps the compact Add action named when its visible label is hidden", () => {
    const html = renderToStaticMarkup(
      createElement(DataViewToolbar<Item>, {
        addLabel: "Add routine",
        isSearchable: false,
        onAdd: vi.fn(),
        showDisplayOptions: false,
        store: store(),
      }),
    );

    expect(html).toContain('aria-label="Add routine"');
    expect(html).toContain('<span class="hidden sm:inline">Add routine</span>');
  });
});
