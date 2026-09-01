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
const customColumnModalStore = vi.hoisted(() => ({ initialize: vi.fn(), open: vi.fn() }));

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
vi.mock("@/components/data-view/custom-columns/custom-field-inputs", () => ({
  CustomFieldInputs: () => createElement("div", { "data-custom-field-inputs": true }),
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
import { EntityDetailCustomFieldsSection } from "../entity-detail-custom-fields-section";
import {
  collapsedSectionIdsForOpenSection,
  reconcileAvailableIds,
  reconcileColumnOrder,
  reconcileSingleOpenSections,
  resolveSingleOpenSectionId,
  resolveOrderedCustomColumns,
} from "../entity-detail-personalization.utils";
import { EntityDetailSection, EntityDetailSectionGroup } from "../entity-detail-section";

const firstId = "10000000-0000-4000-8000-000000000001";
const secondId = "10000000-0000-4000-8000-000000000002";
const thirdId = "10000000-0000-4000-8000-000000000003";
const detailSectionIds = ["base", "relations", "customFields"];
const defaultCollapsedSectionIds = ["relations", "customFields"];
const roots = new Set<Root>();
const TestProvider = EntityDetailPersonalizationProvider as ComponentType<{
  children?: ReactNode;
  config: EntityDetailPersonalizationConfig;
  customColumnIds?: string[];
  initial?: P13nEntry | null;
  persistenceScope: string;
}>;
const TestSection = EntityDetailSection as ComponentType<{
  children?: ReactNode;
  label: string;
  sectionId: string;
}>;
const TestSectionGroup = EntityDetailSectionGroup as ComponentType<{
  children?: ReactNode;
}>;

function sectionView(initial?: P13nEntry | null) {
  return createElement(
    TestProvider,
    {
      config: {
        p13nId: "contact-detail",
        defaultStarredFieldIds: [],
        defaultCollapsedSectionIds,
        sectionIds: detailSectionIds,
      },
      customColumnIds: [],
      initial,
      persistenceScope: "user-1",
    },
    createElement(
      TestSectionGroup,
      null,
      createElement(
        TestSection,
        { label: "Base data", sectionId: "base" },
        createElement("input", {
          id: "identity-probe",
        }),
      ),
      createElement(TestSection, { label: "Relations", sectionId: "relations" }, createElement("div", null, "Links")),
      createElement(
        TestSection,
        { label: "Custom fields", sectionId: "customFields" },
        createElement("div", null, "Fields"),
      ),
    ),
  );
}

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

describe("entity detail single-open section state", () => {
  it("defaults legacy ambiguous section preferences to Base data", () => {
    expect(resolveSingleOpenSectionId(detailSectionIds, [], defaultCollapsedSectionIds)).toBe("base");
    expect(resolveSingleOpenSectionId(detailSectionIds, detailSectionIds, defaultCollapsedSectionIds)).toBe("base");
    expect(resolveSingleOpenSectionId(detailSectionIds, ["relations"], defaultCollapsedSectionIds)).toBe("base");
    expect(reconcileSingleOpenSections(detailSectionIds, [], defaultCollapsedSectionIds)).toEqual(
      defaultCollapsedSectionIds,
    );
  });

  it("preserves an unambiguous saved section and collapses every other section", () => {
    expect(resolveSingleOpenSectionId(detailSectionIds, ["base", "customFields"], defaultCollapsedSectionIds)).toBe(
      "relations",
    );
    expect(collapsedSectionIdsForOpenSection(detailSectionIds, "relations")).toEqual(["base", "customFields"]);
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
    const unknownConfig = { p13nId, defaultStarredFieldIds: [], availableFieldIds: undefined };
    const knownConfig = { p13nId, defaultStarredFieldIds: [], availableFieldIds: [firstId] };
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
          { config: knownConfig, customColumnIds: [firstId], initial: stored, persistenceScope: "user-1" },
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

  it("stores collapsed sections in the same P13N record as pinned fields and field order", async () => {
    const { container, root } = mountNode(sectionView());
    const trigger = container.querySelector<HTMLButtonElement>('[data-detail-section-trigger="relations"]');

    act(() => trigger?.click());
    act(() => root.unmount());
    roots.delete(root);
    await act(async () => Promise.resolve());

    expect(upsertP13nAction).toHaveBeenCalledExactlyOnceWith({
      p13nId: "contact-detail",
      detailOptions: {
        starredFieldIds: [],
        collapsedSectionIds: ["base", "customFields"],
      },
      columnOrder: [],
    });
  });
});

describe("entity detail section", () => {
  it("clips fields throughout the collapse animation", () => {
    const { container } = mountNode(sectionView());
    const content = container.querySelector<HTMLElement>('[data-slot="accordion-content"]');

    expect(content?.className).toContain("overflow-y-hidden");
    expect(content?.className).toContain("data-[state=closed]:animate-accordion-up");
    expect(content?.className).toContain("data-[state=open]:animate-accordion-down");
  });

  it("uses the complete header row as its accessible accordion trigger", () => {
    const { container } = mountNode(sectionView());
    const trigger = container.querySelector<HTMLButtonElement>('[data-detail-section-trigger="base"]');
    const group = container.querySelector<HTMLElement>("[data-detail-section-group]");
    const section = container.querySelector<HTMLElement>('[data-detail-section="base"]');
    const content = container.querySelector<HTMLElement>('[data-detail-section-content="base"]');

    expect(trigger?.tagName).toBe("BUTTON");
    expect(trigger?.className).toContain("w-full");
    expect(trigger?.className).toContain("rounded-none");
    expect(trigger?.className).toContain("p-4");
    expect(trigger?.className).not.toContain("bg-muted/30");
    expect(group?.className).toContain("-mx-4");
    expect(group?.className).toContain("-mt-4");
    expect(group?.className).not.toContain("@6xl/detail:mt-0");
    expect(group?.className).not.toContain("divide-y");
    expect(group?.className).not.toContain("border-b");
    expect(group?.className).not.toContain("border-t");
    expect(section?.className).toContain("border-b");
    expect(section?.className).toContain("border-border");
    expect(trigger?.textContent).toContain("Base data");
    expect(trigger?.querySelector("span")?.className).not.toContain("uppercase");
    expect(trigger?.getAttribute("aria-label")).toBeNull();
    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    expect(trigger?.getAttribute("aria-disabled")).toBe("true");
    expect(trigger?.className).toContain("aria-disabled:cursor-default");
    expect(trigger?.getAttribute("aria-controls")).toBe(content?.id);
    expect(content?.getAttribute("aria-labelledby")).toBe(trigger?.id);
    expect(content?.getAttribute("role")).toBe("region");
    expect(trigger?.querySelector("button")).toBeNull();
    expect(content?.firstElementChild?.className).toContain("pb-4");

    act(() => trigger?.click());

    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
  });

  it("opens exactly one section and does not let the active section close", () => {
    const stored: P13nEntry = {
      p13nId: "contact-detail",
      columnOrder: [],
      detailOptions: { starredFieldIds: [], collapsedSectionIds: [] },
    };
    const { container } = mountNode(sectionView(stored));
    const base = container.querySelector<HTMLButtonElement>('[data-detail-section-trigger="base"]');
    const relations = container.querySelector<HTMLButtonElement>('[data-detail-section-trigger="relations"]');
    const customFields = container.querySelector<HTMLButtonElement>('[data-detail-section-trigger="customFields"]');

    expect(base?.getAttribute("aria-expanded")).toBe("true");
    expect(base?.getAttribute("aria-disabled")).toBe("true");
    expect(relations?.getAttribute("aria-expanded")).toBe("false");
    expect(customFields?.getAttribute("aria-expanded")).toBe("false");

    act(() => relations?.click());

    expect(base?.getAttribute("aria-expanded")).toBe("false");
    expect(base?.getAttribute("aria-disabled")).toBeNull();
    expect(relations?.getAttribute("aria-expanded")).toBe("true");
    expect(relations?.getAttribute("aria-disabled")).toBe("true");
    expect(customFields?.getAttribute("aria-expanded")).toBe("false");

    act(() => relations?.click());

    expect(relations?.getAttribute("aria-expanded")).toBe("true");
  });

  it("supports arrow-key navigation between section triggers", () => {
    const { container } = mountNode(sectionView());
    const base = container.querySelector<HTMLButtonElement>('[data-detail-section-trigger="base"]');
    const relations = container.querySelector<HTMLButtonElement>('[data-detail-section-trigger="relations"]');

    act(() => {
      base?.focus();
      base?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }));
    });

    expect(document.activeElement).toBe(relations);
  });

  it("uses the selected full-width divider treatment", () => {
    const { container } = mountNode(sectionView());
    const group = container.querySelector<HTMLElement>("[data-detail-section-group]");
    const section = container.querySelector<HTMLElement>('[data-detail-section="base"]');

    expect(group?.className).toContain("-mx-4");
    expect(group?.className).not.toContain("border-b");
    expect(group?.className).not.toContain("border-t");
    expect(section?.className).toContain("border-b");
    expect(container.querySelectorAll("#identity-probe")).toHaveLength(1);
  });

  it("keeps Add field inside the open Custom fields section", () => {
    const { container } = mountNode(
      createElement(
        TestProvider,
        {
          config: {
            p13nId: "contact-detail",
            defaultStarredFieldIds: [],
            defaultCollapsedSectionIds: [],
            sectionIds: ["customFields"],
          },
          customColumnIds: [],
          persistenceScope: "user-1",
        },
        createElement(
          TestSectionGroup,
          null,
          createElement(EntityDetailCustomFieldsSection, {
            canManage: true,
            columns: [],
            entityType: EntityType.contact,
            isEditing: true,
            sectionId: "customFields",
          }),
        ),
      ),
    );
    const button = container.querySelector<HTMLButtonElement>("[data-entity-add-custom-field]");

    expect(button?.closest('[data-detail-section-content="customFields"]')).not.toBeNull();
    expect(container.querySelectorAll("[data-entity-add-custom-field]")).toHaveLength(1);

    act(() => button?.click());

    expect(customColumnModalStore.initialize).toHaveBeenCalledWith(CustomColumnType.plain, EntityType.contact);
    expect(customColumnModalStore.open).toHaveBeenCalledOnce();
  });
});
