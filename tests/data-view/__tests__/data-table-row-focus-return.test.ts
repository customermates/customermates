// @vitest-environment jsdom

import type { ColumnDef } from "@tanstack/react-table";
import type { ComponentProps, ComponentType, ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { BaseDataViewStore } from "@/core/base/base-data-view.store";

import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("mobx-react-lite", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  observer: <T>(component: T) => component,
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/hooks/use-media-query", () => ({ useIsWiderThan: () => true }));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children),
}));
vi.mock("@/components/shared/use-navigate-to-href", () => ({
  useNavigateToHref: () => vi.fn(),
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({ useHydratedIntlStore: () => ({}) }));

import { DataTable } from "@/components/data-view/data-table";
import { AppModal } from "@/components/modal/app-modal";
import { TooltipProvider } from "@/components/ui/tooltip";

type TestAppModalProps = Omit<ComponentProps<typeof AppModal>, "children"> & { children?: ReactNode };
const TestAppModal = AppModal as ComponentType<TestAppModalProps>;

type Item = { id: string; name: string; url: string };

const ITEMS: Item[] = [
  { id: "webhook-1", name: "Deals webhook", url: "https://example.com/deals" },
  { id: "webhook-2", name: "Contacts webhook", url: "https://example.com/contacts" },
];

const columns: ColumnDef<Item>[] = [
  { id: "name", accessorKey: "name", header: "Name", cell: ({ row }) => row.original.name },
  { id: "url", accessorKey: "url", header: "URL", cell: ({ row }) => row.original.url },
];

function store(): BaseDataViewStore<Item> {
  return {
    columnsDefinition: [{ uid: "name" }, { uid: "url" }],
    columnWidths: {},
    entityType: undefined,
    hiddenColumns: [],
    isItemSelectable: () => true,
    isReady: true,
    items: ITEMS,
    selectedIds: new Set<string>(),
    setPageSelection: vi.fn(),
    setQueryOptions: vi.fn(),
    setViewOptions: vi.fn(),
    sortDescriptor: undefined,
    toggleItemSelection: vi.fn(),
  } as unknown as BaseDataViewStore<Item>;
}

function WebhooksPage({ rowHref }: { rowHref?: (item: Item) => string }) {
  const [open, setOpen] = useState<Item | null>(null);

  return createElement(
    TooltipProvider,
    null,
    createElement(DataTable<Item>, { columns, store: store(), onRowClick: setOpen, onRowHref: rowHref }),
    createElement(
      TestAppModal,
      { open: open !== null, title: "Webhook", onClose: () => setOpen(null) },
      createElement("input", { "aria-label": "URL", id: "webhook-modal-url" }),
    ),
  );
}

let container: HTMLDivElement;
let reactRoot: Root;
const getClientRectsDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "getClientRects");

function cell(text: string) {
  const found = [...container.querySelectorAll<HTMLElement>("td")].find((td) => td.textContent === text);
  if (!found) throw new Error(`Missing cell ${text}`);
  return found;
}

function rowOpenControl(text: string) {
  const control = cell(text).closest("tr")?.querySelector<HTMLElement>('[data-slot="data-row-open"]');
  if (!control) throw new Error(`Missing row open control for ${text}`);
  return control;
}

async function closeWithEscape() {
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  if (!dialog) throw new Error("Expected an open dialog");

  await act(async () => {
    dialog.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape" }));
    await new Promise((resolve) => setTimeout(resolve, 80));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(Element.prototype, "getClientRects", {
    configurable: true,
    value: () => [new DOMRect(0, 0, 10, 10)],
  });
  container = document.createElement("div");
  document.body.append(container);
  reactRoot = createRoot(container);
});

afterEach(() => {
  act(() => reactRoot.unmount());
  container.remove();
  document.body.replaceChildren();
  document.body.style.pointerEvents = "";
  if (getClientRectsDescriptor) Object.defineProperty(Element.prototype, "getClientRects", getClientRectsDescriptor);
});

describe("DataTable row click focus return", () => {
  it.each([
    ["a button", undefined],
    ["a link", (item: Item) => `/company/webhooks/${item.id}`],
  ])(
    "returns focus to the row's open control, rendered as %s, after a dialog opened from another cell closes",
    async (_kind, rowHref) => {
      act(() => reactRoot.render(createElement(WebhooksPage, { rowHref })));

      act(() => cell("https://example.com/contacts").click());

      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
      expect(document.activeElement?.id).toBe("webhook-modal-url");

      await closeWithEscape();

      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).toBe(rowOpenControl("https://example.com/contacts"));
    },
  );

  it.each([
    ["a button", undefined],
    ["a link", (item: Item) => `/company/webhooks/${item.id}`],
  ])(
    "returns focus to the row's open control, rendered as %s, when a click on it did not focus it",
    async (_kind, rowHref) => {
      act(() => reactRoot.render(createElement(WebhooksPage, { rowHref })));
      const control = rowOpenControl("Contacts webhook");

      act(() => control.click());

      expect(document.activeElement?.id).toBe("webhook-modal-url");

      await closeWithEscape();

      expect(document.activeElement).toBe(control);
    },
  );
});
