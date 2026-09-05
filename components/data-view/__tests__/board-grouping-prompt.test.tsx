import type { Root } from "react-dom/client";
import type { ReactNode } from "react";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import type { GroupableFieldDto } from "@/core/base/grouping/groupable-field";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CustomColumnType, EntityType } from "@/generated/prisma";

const harness = vi.hoisted(() => ({
  onFieldChange: undefined as ((value: string) => void) | undefined,
  openForCreate: vi.fn(),
  selectValue: undefined as string | undefined,
}));

vi.mock("mobx-react-lite", () => ({ observer: <T,>(component: T) => component }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ customColumnModalStore: { openForCreate: harness.openForCreate } }),
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({ useHydratedIntlStore: () => ({}) }));
vi.mock("@/components/entity-terminology/use-column-label", () => ({ useColumnLabel: () => (uid: string) => uid }));
vi.mock("@/components/entity-terminology/use-filter-field-label", () => ({
  useFilterFieldLabel: () => (field: string) => `field:${field}`,
}));
vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children: ReactNode;
    onValueChange: (value: string) => void;
    value: string;
  }) => {
    harness.onFieldChange = onValueChange;
    harness.selectValue = value;
    return createElement("div", { "data-slot": "select" }, children);
  },
  SelectContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) =>
    createElement("div", { "data-value": value }, children),
  SelectTrigger: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  SelectValue: () => null,
}));

import { BoardGroupingPrompt } from "../board-grouping-prompt";

type Item = { id: string };

const STAGE: GroupableFieldDto = {
  id: "stage",
  grouping: { field: "stage" },
  kind: "customSingleSelect",
  label: "Stage",
  supportsDragWriteBack: true,
};

const CREATED_MONTH: GroupableFieldDto = {
  id: "createdAt:month",
  grouping: { field: "createdAt", bucket: "month" },
  kind: "dateBucket",
  labelKey: "Common.filters.fields.createdAt",
  bucket: "month",
  supportsDragWriteBack: false,
};

function store(overrides: Partial<BaseDataViewStore<Item>> = {}): BaseDataViewStore<Item> {
  return {
    canManage: true,
    currentGroupableFieldId: "",
    entityType: EntityType.deal,
    groupableFields: [STAGE, CREATED_MONTH],
    setViewOptions: vi.fn(),
    ...overrides,
  } as unknown as BaseDataViewStore<Item>;
}

const roots = new Set<Root>();

function render(value: BaseDataViewStore<Item>): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.add(root);
  act(() => {
    root.render(createElement(BoardGroupingPrompt<Item>, { store: value }) as ReactNode);
  });

  return host;
}

function createButton(host: HTMLElement): HTMLButtonElement | null {
  return (
    [...host.querySelectorAll("button")].find((button) => button.textContent === "DataView.board.createField") ?? null
  );
}

beforeEach(() => {
  harness.onFieldChange = undefined;
  harness.selectValue = undefined;
  harness.openForCreate.mockReset();
});

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots.clear();
  document.body.replaceChildren();
});

describe("board grouping prompt", () => {
  it("explains the board and lists every groupable field with its label", () => {
    const host = render(store());

    expect(host.querySelector('[data-slot="empty-state"]')?.textContent).toContain("DataView.board.promptTitle");
    expect(host.textContent).toContain("DataView.board.promptBody");
    expect([...host.querySelectorAll("[data-value]")].map((item) => item.textContent)).toEqual([
      "Stage",
      "field:createdAt · Common.dateBuckets.month",
    ]);
  });

  it("applies the picked field as the grouping", () => {
    const value = store();
    render(value);

    harness.onFieldChange?.("createdAt:month");

    expect(value.setViewOptions).toHaveBeenCalledWith({ grouping: CREATED_MONTH.grouping });
  });

  it("shows the placeholder once the store holds no grouping, so the same field can be picked again", () => {
    render(store({ currentGroupableFieldId: "stage" }));
    expect(harness.selectValue).toBe("stage");

    render(store());
    expect(harness.selectValue).toBe("");
  });

  it("ignores a pick that matches no groupable field", () => {
    const value = store();
    render(value);

    harness.onFieldChange?.("unknown");

    expect(value.setViewOptions).not.toHaveBeenCalled();
  });

  it("hides the field select on a surface with nothing to group by", () => {
    const host = render(store({ entityType: undefined, groupableFields: [] }));

    expect(host.querySelector('[data-slot="select"]')).toBeNull();
    expect(host.textContent).toContain("DataView.board.promptTitle");
  });

  it("offers the single-select creation only on an entity surface the user can manage", () => {
    expect(createButton(render(store({ entityType: undefined })))).toBeNull();
    expect(createButton(render(store({ canManage: false })))).toBeNull();
    expect(createButton(render(store()))).not.toBeNull();
  });

  it("opens the custom column modal on single-select and groups by the saved column", () => {
    const value = store();
    const host = render(value);

    act(() => createButton(host)?.click());

    expect(harness.openForCreate).toHaveBeenCalledOnce();
    const params = harness.openForCreate.mock.calls[0][0] as {
      type: CustomColumnType;
      entityType: EntityType;
      onSaved: (column: CustomColumnDto) => void;
    };
    expect(params.type).toBe(CustomColumnType.singleSelect);
    expect(params.entityType).toBe(EntityType.deal);

    params.onSaved({ id: "col-new" } as CustomColumnDto);

    expect(value.setViewOptions).toHaveBeenCalledWith({ grouping: { field: "col-new" } });
  });
});
