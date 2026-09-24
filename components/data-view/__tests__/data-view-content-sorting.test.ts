import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import type { BaseDataViewStore } from "@/core/base/base-data-view.store";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("mobx-react-lite", () => ({ observer: <T>(component: T) => component }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/components/entity-detail/hooks/use-entity-drawer-stack", () => ({
  useNavigateToHref: () => vi.fn(),
}));
vi.mock("@/components/entity-terminology/use-column-label", () => ({
  useColumnLabel: () => (id: string) => id,
}));
vi.mock("../data-kanban-view", () => ({ DataKanbanView: () => null }));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => createElement("span", null, children),
  TooltipContent: () => null,
  TooltipProvider: ({ children }: { children: ReactNode }) => createElement("span", null, children),
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("../group-label", () => ({
  useGroupLabel: () => (group: { key: string }) => group.key,
  visibleGroups: () => [],
}));

import { DataViewContent } from "../data-view-content";

type Item = { id: string; name: string; email: string };

const columns: ColumnDef<Item>[] = [
  { id: "name", header: "Name header", cell: ({ row }) => row.original.name },
  { id: "email", accessorKey: "email", header: "Email header", cell: ({ row }) => row.original.email },
  { id: "role", header: "Role header", cell: () => "Admin" },
];

function store(sortable: string[]): BaseDataViewStore<Item> {
  const columnsDefinition = ["name", "email", "role"].map((uid) => ({ uid, sortable: sortable.includes(uid) }));

  return {
    columnWidths: {},
    columnsDefinition,
    entityType: undefined,
    hiddenColumns: [],
    isItemSelectable: () => true,
    items: [{ id: "user-1", name: "Max", email: "max@example.com" }],
    orderedColumns: columnsDefinition,
    selectedIds: new Set(),
    setPageSelection: vi.fn(),
    setQueryOptions: vi.fn(),
    setViewOptions: vi.fn(),
    sortDescriptor: undefined,
    sortableColumnIds: new Set(sortable),
    toggleItemSelection: vi.fn(),
  } as unknown as BaseDataViewStore<Item>;
}

function sortButtonLabels(sortable: string[]): string[] {
  const html = renderToStaticMarkup(
    createElement(DataViewContent<Item>, { columns, store: store(sortable), view: "table" }),
  );
  const head = html.slice(html.indexOf("<thead"), html.indexOf("</thead>"));

  return [...head.matchAll(/<button[^>]*><span class="min-w-0 truncate">([^<]+)<\/span>/g)].map((match) => match[1]);
}

describe("data view header sorting", () => {
  it("offers a header sort button only for the columns the store marks sortable", () => {
    expect(sortButtonLabels(["name"])).toEqual(["Name header"]);
  });

  it("gives no sort button to a column whose hook sets an accessorKey but no repository sorts", () => {
    expect(sortButtonLabels([])).toEqual([]);
  });

  it("gives the sort button back once the store marks that column sortable", () => {
    expect(sortButtonLabels(["name", "email"])).toEqual(["Name header", "Email header"]);
  });
});
