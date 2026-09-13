import type { Root } from "react-dom/client";
import type { ComponentType, ReactNode } from "react";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { EntityDetailPersonalizationConfig } from "../entity-detail-personalization";
import type { P13nEntry } from "@/features/p13n/prisma-p13n.repository";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomColumnType, EntityType } from "@/generated/prisma";

const upsertP13nAction = vi.hoisted(() => vi.fn());
const customColumnModalStore = vi.hoisted(() => ({
  initialize: vi.fn(),
  open: vi.fn(),
}));

vi.mock("@/app/actions", () => ({ upsertP13nAction }));
vi.mock("@/core/errors/report-application-error", () => ({
  reportApplicationError: vi.fn(),
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({
  toastZodErrorTree: vi.fn(),
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ customColumnModalStore }),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { section?: string }) =>
    values?.section ? `${key}:${values.section}` : key,
}));

import {
  EntityDetailPersonalizationProvider,
  resetEntityDetailPersonalizationPersistenceForTests,
  useEntityDetailPersonalization,
} from "../entity-detail-personalization";
import {
  reconcileAvailableIds,
  reconcileColumnOrder,
  resolveOrderedCustomColumns,
  resolveDetailFieldOrder,
} from "../entity-detail-personalization.utils";
import { EntityDetailFieldDragHandle, EntityDetailFields } from "../entity-detail-fields";
import { FormControlRow } from "@/components/forms/form-control-row";

const firstId = "10000000-0000-4000-8000-000000000001";
const secondId = "10000000-0000-4000-8000-000000000002";
const thirdId = "10000000-0000-4000-8000-000000000003";
const roots = new Set<Root>();
const TestProvider = EntityDetailPersonalizationProvider as ComponentType<{
  children?: ReactNode;
  config: EntityDetailPersonalizationConfig;
  customColumnIds?: string[];
  initial?: P13nEntry | null;
  persistenceScope: string;
}>;
const TestControlRow = FormControlRow as ComponentType<{ children?: ReactNode; startAddon?: ReactNode }>;

describe("entity detail drag handle placement", () => {
  it("anchors the grip beside the control and preserves drafts when customization toggles", () => {
    function Customize() {
      const { isPersonalizing, setIsPersonalizing } = useEntityDetailPersonalization();
      return createElement("button", {
        "data-customize": true,
        type: "button",
        onClick: () => setIsPersonalizing(!isPersonalizing),
      });
    }

    const { container } = mountNode(
      createElement(
        TestProvider,
        {
          config: { p13nId: "deal-detail", defaultStarredFieldIds: [], availableFieldIds: ["name"] },
          persistenceScope: "user-1",
        },
        createElement(Customize),
        createElement(EntityDetailFields, {
          fields: [
            {
              id: "name",
              content: createElement(
                "div",
                null,
                createElement("label", { htmlFor: "name", "data-field-label": true }, "A wrapping field label"),
                createElement(
                  TestControlRow,
                  {
                    startAddon: createElement(EntityDetailFieldDragHandle, { label: "Name" }),
                  },
                  createElement("textarea", { id: "name", defaultValue: "Original" }),
                ),
              ),
            },
          ],
        }),
      ),
    );
    const input = container.querySelector<HTMLTextAreaElement>("textarea");
    if (!input) throw new Error("Expected the field control to be rendered");
    input.value = "Unsaved draft";
    expect(container.querySelector("[data-field-drag-handle]")).toBeNull();

    act(() => container.querySelector<HTMLButtonElement>("[data-customize]")?.click());

    const handle = container.querySelector<HTMLButtonElement>("[data-field-drag-handle]");
    expect(handle?.closest("[data-form-control-row]")).toBe(input.closest("[data-form-control-row]"));
    expect(handle?.getAttribute("aria-label")).toBe("DataView.dragToReorder: Name");
    expect(handle?.type).toBe("button");
    expect(container.querySelector("[data-field-label] [data-field-drag-handle]")).toBeNull();
    expect(container.querySelector("[data-sortable-field]")?.classList.contains("pl-7")).toBe(true);
    expect(container.querySelector("textarea")).toBe(input);

    act(() => container.querySelector<HTMLButtonElement>("[data-customize]")?.click());

    expect(container.querySelector("[data-field-drag-handle]")).toBeNull();
    expect(container.querySelector("[data-sortable-field]")?.classList.contains("pl-7")).toBe(false);
    expect(container.querySelector("textarea")).toBe(input);
    expect(input.value).toBe("Unsaved draft");
  });
});

function Probe() {
  const personalization = useEntityDetailPersonalization();
  return createElement(
    "button",
    {
      "data-column-order": personalization.columnOrder.join(","),
      "data-starred-fields": personalization.starredFieldIds.join(","),
      type: "button",
      onClick: () => personalization.toggleStarredField("first-name"),
    },
    "Toggle first name",
  );
}

function view(customColumnIds: string[], persistenceScope = "user-1") {
  return createElement(
    TestProvider,
    {
      config: { p13nId: "contact-detail", defaultStarredFieldIds: [] },
      customColumnIds,
      persistenceScope,
    },
    createElement(Probe),
  );
}

function mount(customColumnIds: string[], persistenceScope = "user-1") {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.add(root);
  act(() => root.render(view(customColumnIds, persistenceScope)));
  return { container, root };
}

function mountNode(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.add(root);
  act(() => root.render(node));
  return { container, root };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  resetEntityDetailPersonalizationPersistenceForTests();
  upsertP13nAction.mockReset();
  upsertP13nAction.mockResolvedValue({ ok: true, data: {} });
  customColumnModalStore.initialize.mockReset();
  customColumnModalStore.open.mockReset();
});

afterEach(() => {
  act(() => roots.forEach((root) => root.unmount()));
  roots.clear();
  document.body.replaceChildren();
});

describe("entity detail custom field order", () => {
  it("reorders standard and custom inputs together without losing drafts and mirrors custom order for drawers", async () => {
    const fieldIds = ["name", "organizationIds", secondId, firstId, "createdAt", "updatedAt"];
    function OrderControls() {
      const { reorderFields } = useEntityDetailPersonalization();
      return createElement(
        "button",
        {
          "data-reorder-fields": true,
          type: "button",
          onClick: () => reorderFields([firstId, "organizationIds", "name", secondId, "createdAt", "updatedAt"]),
        },
        "Reorder fields",
      );
    }
    const { container, root } = mountNode(
      createElement(
        TestProvider,
        {
          config: {
            p13nId: "deal-detail",
            defaultStarredFieldIds: ["name"],
            availableFieldIds: [...fieldIds, firstId, secondId],
          },
          customColumnIds: [firstId, secondId],
          initial: { p13nId: "deal-detail", columnOrder: [secondId, firstId] },
          persistenceScope: "user-1",
        },
        createElement(OrderControls),
        createElement(EntityDetailFields, {
          fields: fieldIds.map((id) => ({
            id,
            content: createElement("input", { id, defaultValue: id }),
          })),
        }),
      ),
    );
    const nameInput = container.querySelector<HTMLInputElement>("#name");
    if (!nameInput) throw new Error("Expected the name input to be rendered");
    nameInput.value = "Unsaved draft";

    act(() => container.querySelector<HTMLButtonElement>("[data-reorder-fields]")?.click());

    expect(Array.from(container.querySelectorAll("input"), (input) => input.id)).toEqual([
      firstId,
      "organizationIds",
      "name",
      secondId,
      "createdAt",
      "updatedAt",
    ]);
    expect(container.querySelector("#name")).toBe(nameInput);
    expect(nameInput.value).toBe("Unsaved draft");

    act(() => root.unmount());
    roots.delete(root);
    await act(async () => Promise.resolve());

    expect(upsertP13nAction).toHaveBeenCalledExactlyOnceWith({
      p13nId: "deal-detail",
      columnOrder: [firstId, secondId],
      detailOptions: {
        starredFieldIds: ["name"],
        collapsedSectionIds: [],
        fieldOrder: [firstId, "organizationIds", "name", secondId, "createdAt", "updatedAt"],
      },
    });
  });

  it("removes stale preference IDs while preserving the user's order", () => {
    expect(reconcileAvailableIds(["updatedAt", "deleted", "updatedAt", "userIds"], ["userIds", "updatedAt"])).toEqual([
      "updatedAt",
      "userIds",
    ]);
  });

  it("keeps valid saved fields first, ignores stale fields, and appends new fields", () => {
    expect(reconcileColumnOrder([firstId, secondId, thirdId], [secondId, "deleted", secondId, firstId])).toEqual([
      secondId,
      firstId,
      thirdId,
    ]);
  });

  it("retains the original form index after visual reordering", () => {
    const columns: CustomColumnDto[] = [firstId, secondId, thirdId].map((id, index) => ({
      id,
      entityType: EntityType.contact,
      label: `Field ${index + 1}`,
      type: CustomColumnType.plain,
    }));

    expect(resolveOrderedCustomColumns(columns, [thirdId, firstId, secondId])).toEqual([
      { column: columns[2], formIndex: 2 },
      { column: columns[0], formIndex: 0 },
      { column: columns[1], formIndex: 1 },
    ]);
  });

  it("adds live custom columns to the reorderable order without requiring a reload", () => {
    const { container, root } = mount([firstId]);

    act(() => root.render(view([firstId, secondId])));

    expect(container.querySelector("button")?.dataset.columnOrder).toBe(`${firstId},${secondId}`);
  });
});

describe("entity detail preference persistence", () => {
  it("preserves custom-field preferences until column metadata becomes authoritative", async () => {
    const p13nId = "contact-detail-metadata";
    const stored: P13nEntry = {
      p13nId,
      columnOrder: [firstId],
      detailOptions: { starredFieldIds: [firstId], collapsedSectionIds: [] },
    };
    const unknownConfig = {
      p13nId,
      defaultStarredFieldIds: [],
      availableFieldIds: undefined,
    };
    const knownConfig = {
      p13nId,
      defaultStarredFieldIds: [],
      availableFieldIds: [firstId],
    };
    const { container, root } = mountNode(
      createElement(
        TestProvider,
        {
          config: unknownConfig,
          customColumnIds: undefined,
          initial: stored,
          persistenceScope: "user-1",
        },
        createElement(Probe),
      ),
    );

    expect(container.querySelector("button")?.dataset.starredFields).toBe(firstId);
    expect(container.querySelector("button")?.dataset.columnOrder).toBe(firstId);

    act(() =>
      root.render(
        createElement(
          TestProvider,
          {
            config: knownConfig,
            customColumnIds: [firstId],
            initial: stored,
            persistenceScope: "user-1",
          },
          createElement(Probe),
        ),
      ),
    );
    await act(async () => Promise.resolve());

    expect(container.querySelector("button")?.dataset.starredFields).toBe(firstId);
    expect(upsertP13nAction).not.toHaveBeenCalled();
  });

  it("carries an unsaved preference across record remounts without leaking it to another user", async () => {
    let resolveFirstWrite: ((value: { ok: true; data: Record<string, never> }) => void) | undefined;
    upsertP13nAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstWrite = resolve;
        }),
    );

    const firstRecord = mount([firstId]);
    act(() => firstRecord.container.querySelector("button")?.click());
    act(() => firstRecord.root.unmount());
    roots.delete(firstRecord.root);
    await act(async () => Promise.resolve());

    const otherUser = mount([firstId], "user-2");
    expect(otherUser.container.querySelector("button")?.dataset.starredFields).toBe("");
    act(() => otherUser.root.unmount());
    roots.delete(otherUser.root);

    const nextRecord = mount([firstId]);
    const nextButton = nextRecord.container.querySelector("button");
    expect(nextButton?.dataset.starredFields).toBe("first-name");

    act(() => nextButton?.click());
    act(() => nextRecord.root.unmount());
    roots.delete(nextRecord.root);
    await act(async () => Promise.resolve());

    expect(upsertP13nAction).toHaveBeenCalledTimes(1);
    resolveFirstWrite?.({ ok: true, data: {} });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(upsertP13nAction).toHaveBeenCalledTimes(2);
    expect(upsertP13nAction.mock.calls[0]?.[0].detailOptions.starredFieldIds).toEqual(["first-name"]);
    expect(upsertP13nAction.mock.calls[1]?.[0].detailOptions.starredFieldIds).toEqual([]);
  });

  it("flushes a pending preference when the page unmounts before the debounce", async () => {
    const { container, root } = mount([firstId]);
    const button = container.querySelector("button");

    act(() => button?.click());
    expect(upsertP13nAction).not.toHaveBeenCalled();

    act(() => root.unmount());
    roots.delete(root);
    await act(async () => Promise.resolve());

    expect(upsertP13nAction).toHaveBeenCalledExactlyOnceWith({
      p13nId: "contact-detail",
      detailOptions: {
        starredFieldIds: ["first-name"],
        collapsedSectionIds: [],
      },
      columnOrder: [firstId],
    });
  });
});

describe("unified overview field order", () => {
  it("inserts legacy custom columns before timestamps while preserving their previous order", () => {
    expect(
      resolveDetailFieldOrder(
        ["name", secondId, firstId, "createdAt", "updatedAt"],
        ["name", "createdAt", "updatedAt"],
      ),
    ).toEqual(["name", secondId, firstId, "createdAt", "updatedAt"]);
  });

  it("preserves an explicit mixed order and reconciles new, removed, and duplicate fields", () => {
    expect(
      resolveDetailFieldOrder(
        ["name", firstId, thirdId, "createdAt", "updatedAt"],
        [firstId, "name", "deleted", "createdAt", firstId, "updatedAt"],
      ),
    ).toEqual([firstId, "name", thirdId, "createdAt", "updatedAt"]);
    expect(
      resolveDetailFieldOrder(["name", firstId, "createdAt", "updatedAt"], ["updatedAt", firstId, "name", "createdAt"]),
    ).toEqual(["updatedAt", firstId, "name", "createdAt"]);
  });
});
