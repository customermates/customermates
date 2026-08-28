import type { Root } from "react-dom/client";
import type { ComponentType, ReactNode } from "react";
import type { EntityDetailSummaryField } from "../entity-detail-summary";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomColumnType, EntityType } from "@/generated/prisma";

const harness = vi.hoisted(() => ({
  isTruncated: false,
  onAvatarClick: vi.fn(),
  starredFieldIds: [] as string[],
}));

vi.mock("../entity-detail-personalization", () => ({
  useEntityDetailPersonalization: () => ({
    starredFieldIds: harness.starredFieldIds,
  }),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => (key === "NavigationBar.overview" ? "Overview" : key),
}));
vi.mock("../entity-detail-pin-button", () => ({
  EntityDetailPinButton: ({ fieldId }: { fieldId: string }) => createElement("button", { "data-pin": fieldId }),
}));
vi.mock("../entity-detail-field-actions", () => ({
  EntityDetailFieldActions: ({ fieldId }: { fieldId: string }) => createElement("button", { "data-pin": fieldId }),
}));
vi.mock("../hooks/use-entity-drawer-stack", () => ({
  useEntityHref: () => vi.fn(),
}));
vi.mock("@/components/entity-detail/hooks/use-entity-drawer-stack", () => ({
  useEntityHref: () => vi.fn(),
}));
vi.mock("@/components/chip/app-chip-stack", () => ({
  AppChipStack: () => createElement("span"),
}));
vi.mock("@/components/shared/avatar-stack", () => ({
  AvatarStack: ({
    items,
    onAvatarClick,
  }: {
    items: Array<{ id: string }>;
    onAvatarClick?: (item: { id: string }) => void;
  }) =>
    createElement("button", {
      "data-avatar-stack": true,
      onClick: () => onAvatarClick?.(items[0]),
      type: "button",
    }),
}));
vi.mock("@/components/forms/form-label", () => ({
  FormLabel: ({ children }: { children?: ReactNode }) => createElement("label", null, children),
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => createElement("div", { "data-slot": "tooltip" }, children),
  TooltipContent: ({ children }: { children?: ReactNode }) =>
    createElement("span", { "data-slot": "tooltip-content" }, children),
  TooltipProvider: ({ children }: { children?: ReactNode }) =>
    createElement("div", { "data-slot": "tooltip-provider" }, children),
  TooltipTrigger: ({ children }: { children?: ReactNode }) =>
    createElement("span", { "data-slot": "tooltip-trigger" }, children),
}));
vi.mock("@/components/data-view/custom-columns/custom-field-value", () => ({
  CustomFieldValue: ({ column, showOverflowTooltip }: { column: { id: string }; showOverflowTooltip?: boolean }) =>
    createElement(
      "span",
      {
        "data-custom-value": column.id,
        "data-overflow-tooltip": showOverflowTooltip || undefined,
      },
      `Value for ${column.id}`,
    ),
}));
vi.mock("@/core/utils/use-is-truncated", () => ({
  useIsTruncated: () => harness.isTruncated,
}));

import { EntityDetailAvatarSummaryValue, EntityDetailSummary, previewItems } from "../entity-detail-summary";
import { EntityDetailStaticField } from "../entity-detail-static-field";

const roots = new Set<Root>();
const Summary = EntityDetailSummary as ComponentType<{
  customColumns: Array<{
    id: string;
    entityType: EntityType;
    label: string;
    type: CustomColumnType;
  }>;
  customFieldValues: Array<{ columnId: string; value: string }>;
  entityId: string;
  fields: EntityDetailSummaryField[];
}>;

function mount(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.add(root);
  act(() => root.render(node));
  return container;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.isTruncated = false;
  harness.onAvatarClick.mockReset();
  harness.starredFieldIds = [];
});

afterEach(() => {
  act(() => roots.forEach((root) => root.unmount()));
  roots.clear();
  document.body.replaceChildren();
});

describe("EntityDetailSummary", () => {
  it("keeps a selected fallback item visible while its autocomplete data is being rehydrated", () => {
    const fallback = [{ id: "organization-1", name: "Acme" }];

    expect(previewItems([{ key: "organization-1" }], fallback)).toEqual(fallback);
  });

  it("preserves the item action on a pinned avatar stack", () => {
    const container = mount(
      createElement(EntityDetailAvatarSummaryValue, {
        items: [
          {
            id: "user-1",
            firstName: "Max",
            lastName: "Bergmann",
          },
        ],
        onItemClick: harness.onAvatarClick,
      }),
    );

    const avatarStack = container.querySelector<HTMLButtonElement>("[data-avatar-stack]");
    if (!avatarStack) throw new Error("Expected an assignee avatar stack");

    act(() => avatarStack.click());

    expect(harness.onAvatarClick).toHaveBeenCalledOnce();
    expect(harness.onAvatarClick).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "user-1",
      }),
    );
  });

  it("uses the saved pin order across built-in and custom fields and ignores stale fields", () => {
    harness.starredFieldIds = ["updatedAt", "custom-1", "deleted", "name"];
    const container = mount(
      createElement(Summary, {
        customColumns: [
          {
            id: "custom-1",
            entityType: EntityType.contact,
            label: "Customer tier",
            type: CustomColumnType.plain,
          },
        ],
        customFieldValues: [{ columnId: "custom-1", value: "Gold" }],
        entityId: "contact-1",
        fields: [
          { id: "name", label: "Name", value: "Ada Lovelace" },
          { id: "updatedAt", label: "Updated at", value: "Today" },
        ],
      }),
    );

    expect(
      [...container.querySelectorAll<HTMLElement>("[data-summary-cell]")].map((cell) => cell.dataset.summaryCell),
    ).toEqual(["updatedAt", "custom-1", "name"]);
    expect(container.querySelector('[data-custom-value="custom-1"]')).not.toBeNull();
    expect(container.querySelector('[data-custom-value="custom-1"]')?.getAttribute("data-overflow-tooltip")).toBe(
      "true",
    );
  });

  it("renders the selected D pattern as quiet content-sized cards joined by one lower boundary", () => {
    const ids = Array.from({ length: 12 }, (_, index) => `field-${index}`);
    harness.starredFieldIds = ids;
    const container = mount(
      createElement(Summary, {
        customColumns: [],
        customFieldValues: [],
        entityId: "deal-1",
        fields: ids.map((id) => ({ id, label: id, value: id })),
      }),
    );

    const summary = container.querySelector<HTMLElement>("[data-entity-detail-summary]");
    const rail = container.querySelector<HTMLElement>("[data-summary-rail]");
    const cells = [...container.querySelectorAll<HTMLElement>("[data-summary-cell]")];

    expect(summary?.dataset.summaryVariant).toBe("pinned-mini-cards");
    expect(summary?.classList.contains("border-b")).toBe(true);
    expect(summary?.className).not.toContain("sticky");
    expect(rail?.dataset.summaryGeometry).toBe("cards");
    expect(rail?.classList.contains("gap-2")).toBe(true);
    expect(rail?.classList.contains("pt-0")).toBe(true);
    expect(rail?.classList.contains("pb-4")).toBe(true);
    expect(cells).toHaveLength(12);
    expect(cells.every((cell) => cell.classList.contains("w-fit"))).toBe(true);
    expect(cells.every((cell) => cell.classList.contains("min-w-0"))).toBe(true);
    expect(cells.every((cell) => !cell.classList.contains("min-w-28"))).toBe(true);
    expect(cells.every((cell) => cell.classList.contains("max-w-56"))).toBe(true);
    expect(cells.every((cell) => cell.classList.contains("border-border/60"))).toBe(true);
    expect(container.querySelector("[data-summary-comparison]")).toBeNull();
    expect(container.querySelector("[data-summary-panel-divider]")).toBeNull();
  });

  it("makes the horizontal rail a labelled keyboard region only while it overflows", () => {
    harness.starredFieldIds = ["name", "updatedAt"];
    const container = mount(
      createElement(Summary, {
        customColumns: [],
        customFieldValues: [],
        entityId: "deal-1",
        fields: [
          { id: "name", label: "Name", value: "Process Automation Program" },
          { id: "updatedAt", label: "Updated at", value: "Today" },
        ],
      }),
    );
    const scrollRegion = container.querySelector<HTMLElement>("[data-summary-scroll-region]");
    if (!scrollRegion) throw new Error("Expected the summary scroll region");

    expect(scrollRegion.getAttribute("tabindex")).toBeNull();
    expect(scrollRegion.getAttribute("role")).toBeNull();
    expect(scrollRegion.getAttribute("aria-label")).toBeNull();

    Object.defineProperty(scrollRegion, "clientWidth", {
      configurable: true,
      value: 240,
    });
    Object.defineProperty(scrollRegion, "scrollWidth", {
      configurable: true,
      value: 480,
    });
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(scrollRegion.dataset.summaryOverflow).toBe("true");
    expect(scrollRegion.getAttribute("tabindex")).toBe("0");
    expect(scrollRegion.getAttribute("role")).toBe("region");
    expect(scrollRegion.getAttribute("aria-label")).toBe("Overview");
    expect(scrollRegion.className).toContain("focus-visible:ring-[3px]");
    expect(scrollRegion.className).toContain("focus-visible:ring-inset");

    Object.defineProperty(scrollRegion, "scrollWidth", {
      configurable: true,
      value: 240,
    });
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(scrollRegion.getAttribute("tabindex")).toBeNull();
    expect(scrollRegion.getAttribute("role")).toBeNull();
    expect(scrollRegion.getAttribute("aria-label")).toBeNull();
  });

  it("discloses truncated labels and primitive values without wrapping rich controls", () => {
    harness.isTruncated = true;
    harness.starredFieldIds = ["name", "relation"];
    const container = mount(
      createElement(Summary, {
        customColumns: [],
        customFieldValues: [],
        entityId: "deal-1",
        fields: [
          {
            id: "name",
            label: "A very long field label that needs to be disclosed",
            value: "Process Automation Program with a deliberately long suffix",
          },
          {
            id: "relation",
            label: "Relation",
            value: createElement("button", { "data-rich-summary-value": true }, "Open relation"),
          },
        ],
      }),
    );

    const nameCell = container.querySelector<HTMLElement>('[data-summary-cell="name"]');
    const relationValue = container.querySelector<HTMLElement>('[data-summary-cell="relation"] [data-summary-value]');

    expect(nameCell?.querySelector('[data-summary-label] [data-slot="tooltip-trigger"]')).not.toBeNull();
    expect(nameCell?.querySelector('[data-summary-value] [data-slot="tooltip-trigger"]')).not.toBeNull();
    expect(
      [...(nameCell?.querySelectorAll<HTMLElement>('[data-slot="tooltip-content"]') ?? [])].map(
        (content) => content.textContent,
      ),
    ).toEqual([
      "A very long field label that needs to be disclosed",
      "Process Automation Program with a deliberately long suffix",
    ]);
    expect(nameCell?.querySelectorAll('[tabindex="0"]')).toHaveLength(2);
    expect(relationValue?.querySelector('[data-slot="tooltip-trigger"]')).toBeNull();
    expect(relationValue?.querySelector('[data-rich-summary-value="true"]')).not.toBeNull();
  });

  it("keeps short pinned text out of the keyboard order without a redundant tooltip", () => {
    harness.starredFieldIds = ["name"];
    const container = mount(
      createElement(Summary, {
        customColumns: [],
        customFieldValues: [],
        entityId: "deal-1",
        fields: [{ id: "name", label: "Name", value: "Acme" }],
      }),
    );

    const nameCell = container.querySelector<HTMLElement>('[data-summary-cell="name"]');

    expect(nameCell?.querySelectorAll('[data-slot="tooltip-trigger"]')).toHaveLength(2);
    expect(nameCell?.querySelector('[data-slot="tooltip-content"]')).toBeNull();
    expect(nameCell?.querySelector('[tabindex="0"]')).toBeNull();
  });

  it("does not render an empty pinned-fields row", () => {
    const container = mount(
      createElement(Summary, {
        customColumns: [],
        customFieldValues: [],
        entityId: "contact-1",
        fields: [{ id: "name", label: "Name", value: "Ada Lovelace" }],
      }),
    );

    expect(container.querySelector("[data-entity-detail-summary]")).toBeNull();
  });
});

describe("EntityDetailStaticField", () => {
  it("uses the shared muted read-only field treatment and exposes its inline pin control", () => {
    const container = mount(
      createElement(EntityDetailStaticField, {
        fieldId: "createdAt",
        label: "Created at",
        value: "",
      }),
    );

    expect(container.querySelector('[data-pin="createdAt"]')).not.toBeNull();
    expect(container.textContent).toContain("—");
    const value = container.querySelector<HTMLElement>('[data-field-state="read-only"]');
    expect(value).not.toBeNull();
    expect(value?.getAttribute("aria-readonly")).toBe("true");
    expect(value?.classList.contains("border-border")).toBe(true);
    expect(value?.classList.contains("bg-background")).toBe(true);
    expect(value?.classList.contains("bg-input-background")).toBe(false);
    expect(value?.querySelector(".select-text")).not.toBeNull();
    expect(value?.querySelector("input")).toBeNull();
  });
});
