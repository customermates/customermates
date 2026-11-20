import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("mobx-react-lite", () => ({
  observer: <T,>(component: T) => component,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/components/shared/use-navigate-to-href", () => ({
  useNavigateToHref: () => vi.fn(),
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => createElement("span", null, children),
  TooltipContent: () => null,
  TooltipProvider: ({ children }: { children: ReactNode }) => createElement("span", null, children),
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatMonthYear: (date: Date) => `month:${date.toISOString()}`,
    formatDescriptiveShortDate: (date: Date) => `date:${date.toISOString()}`,
  }),
}));

import { DataTable, type DataTableColumnStyle } from "../data-table";

type Item = { id: string; name: string };

const columns: ColumnDef<Item>[] = [
  { id: "name", accessorKey: "name", header: "Name", cell: ({ row }) => row.original.name },
  { id: "trigger", header: "Trigger", cell: () => "Every Friday" },
  { id: "created", header: "Created", cell: () => "Today" },
];

function store(): BaseDataViewStore<Item> {
  return {
    primaryColumnId: "name",
    columnsDefinition: [{ uid: "name" }, { uid: "trigger" }, { uid: "created" }],
    columnWidths: {},
    supportsSelection: false,
    hiddenColumns: [],
    isGrouped: false,
    isItemSelectable: () => true,
    isRefreshing: false,
    items: [{ id: "a", name: "A routine with a very long name that would push the table wider than its container" }],
    groupingResult: undefined,
    selectedIds: new Set<string>(),
    setQueryOptions: vi.fn(),
    setViewOptions: vi.fn(),
    sortDescriptor: undefined,
    toggleItemSelection: vi.fn(),
  } as unknown as BaseDataViewStore<Item>;
}

const roots = new Set<Root>();

function render(columnStyle?: (columnId: string) => DataTableColumnStyle | undefined): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.add(root);
  act(() => {
    root.render(createElement(DataTable<Item>, { columns, store: store(), columnStyle }) as ReactNode);
  });
  return host;
}

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots.clear();
  document.body.replaceChildren();
});

const flexibleName = (columnId: string) => (columnId === "name" ? { emphasis: true, flexible: true } : undefined);

describe("a flexible table column", () => {
  it("takes the width the other columns leave and truncates instead of widening the table", () => {
    const host = render(flexibleName);
    const [name, trigger] = [...host.querySelectorAll<HTMLElement>("thead th")];
    expect(name.className).toContain("w-full");
    expect(name.style.minWidth).toBe("160px");
    expect(trigger.className).not.toContain("w-full");
    expect(trigger.style.minWidth).toBe("80px");

    const [nameCell, triggerCell] = [...host.querySelectorAll<HTMLElement>("tbody tr td")];
    expect(nameCell.className).toContain("w-full");
    expect(nameCell.className).toContain("max-w-0");
    expect(triggerCell.className).not.toContain("max-w-0");
  });

  it("changes nothing for a table that declares no flexible column", () => {
    const host = render();
    for (const cell of host.querySelectorAll<HTMLElement>("thead th, tbody td")) {
      expect(cell.className).not.toContain("max-w-0");
      expect(cell.className).not.toContain("w-full");
    }
  });
});

describe("the resize handle of the last column", () => {
  it("stays inside the table edge so the table does not scroll sideways by the handle's half width", () => {
    const host = render();
    const handles = [...host.querySelectorAll<HTMLElement>('[data-slot="column-resize-handle"]')];
    expect(handles).toHaveLength(3);
    expect(handles.slice(0, 2).every((handle) => handle.className.includes("translate-x-1/2"))).toBe(true);
    expect(handles[2].className).toContain("translate-x-0");
    expect(handles[2].className).not.toContain("translate-x-1/2");
  });
});
