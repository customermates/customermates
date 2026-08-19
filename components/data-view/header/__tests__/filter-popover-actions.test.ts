import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ReactNode } from "react";
import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import type { EditFiltersModalStore } from "@/components/data-view/filter-modal/edit-filters-modal.store";

const harness = vi.hoisted(() => ({ modalStore: { current: null as unknown } }));

vi.mock("mobx-react-lite", () => ({ observer: <T>(component: T) => component }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ editFiltersModalStore: harness.modalStore.current }),
}));
vi.mock("@/components/modal/hooks/use-delete-confirmation", () => ({
  useDeleteConfirmation: () => ({ showDeleteConfirmation: vi.fn() }),
}));
vi.mock("@/components/modal", () => ({
  ResponsiveOverlay: ({ children, footer }: { children: ReactNode; footer: ReactNode }) =>
    createElement("div", null, footer, children),
}));
vi.mock("@/components/data-view/filter-modal/filter-accordion", () => ({ FilterAccordion: () => null }));
vi.mock("@/components/forms/form-context", () => ({ AppForm: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/forms/form-input", () => ({ FormInput: () => null }));
vi.mock("@/components/ui/separator", () => ({ Separator: () => null }));
vi.mock("../popover-section", () => ({ PopoverSection: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => createElement("button", { type: "button" }, children),
}));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => children,
  DropdownMenuContent: () => null,
  DropdownMenuItem: () => null,
  DropdownMenuSeparator: () => null,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => children,
}));

import { FilterPopover } from "../filter-popover";

function dataViewStore() {
  return {
    customColumns: [],
    filterableFields: [{ field: "name", operators: ["contains"] }],
    filters: [{ field: "name", operator: "contains", value: "acme" }],
  } as unknown as BaseDataViewStore<{ id: string }>;
}

function modalStore(overrides: { isCreatingPreset?: boolean; isEditingPreset?: boolean }) {
  return {
    close: vi.fn(),
    expandedField: undefined,
    flushPendingChanges: vi.fn(),
    form: { filters: [{ field: "name", operator: "contains", value: "acme" }], name: "", presetId: undefined },
    isCreatingPreset: overrides.isCreatingPreset ?? false,
    isEditingPreset: overrides.isEditingPreset ?? false,
    isOpen: true,
    onChange: vi.fn(),
    openFor: vi.fn(),
    savedPresets: [],
    setExpandedField: vi.fn(),
    tableStore: undefined,
  } as unknown as EditFiltersModalStore;
}

function render(overrides: { isCreatingPreset?: boolean; isEditingPreset?: boolean }) {
  const store = dataViewStore();
  harness.modalStore.current = modalStore(overrides);
  return renderToStaticMarkup(createElement(FilterPopover, { store }));
}

describe("filter popover actions", () => {
  it("offers no apply action while filters are applied automatically", () => {
    const markup = render({});

    expect(markup).not.toContain("Common.filters.apply");
    expect(markup).not.toContain("Common.actions.save");
    expect(markup).toContain("Common.actions.clear");
  });

  it("keeps an explicit save while a named preset is being edited", () => {
    const markup = render({ isEditingPreset: true });

    expect(markup).toContain("Common.actions.save");
    expect(markup).toContain("Common.actions.clear");
  });

  it("keeps an explicit save while a named preset is being created", () => {
    const markup = render({ isCreatingPreset: true });

    expect(markup).toContain("Common.actions.save");
    expect(markup).toContain("Common.actions.cancel");
    expect(markup).not.toContain("Common.actions.clear");
  });
});
