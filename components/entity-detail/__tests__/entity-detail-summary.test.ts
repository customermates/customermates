import type { Root } from "react-dom/client";
import type { ComponentType, ReactNode } from "react";
import type { EntityDetailSummaryField } from "../entity-detail-summary";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomColumnType, EntityType } from "@/generated/prisma";

const harness = vi.hoisted(() => ({
  isTruncated: false,
  starredFieldIds: [] as string[],
}));

vi.mock("../entity-detail-personalization", () => ({
  useEntityDetailPersonalization: () => ({
    starredFieldIds: harness.starredFieldIds,
  }),
}));
vi.mock("../entity-detail-star-button", () => ({
  EntityDetailStarButton: ({ fieldId }: { fieldId: string }) => createElement("button", { "data-star": fieldId }),
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
  AvatarStack: () => createElement("span"),
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

import { EntityDetailSummary, previewItems } from "../entity-detail-summary";
import { EntityDetailStaticField } from "../entity-detail-static-field";
import { EntityDetailSummaryGeometryProvider } from "../entity-detail-summary-geometry-context";

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

  it("uses the saved favorite order across built-in and custom fields and ignores stale fields", () => {
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

  it("aligns wide favorite slots and dividers to the three panel tracks", () => {
    const ids = Array.from({ length: 12 }, (_, index) => `field-${index}`);
    harness.starredFieldIds = ids;
    const container = mount(
      createElement(
        EntityDetailSummaryGeometryProvider,
        {
          showActivityPanel: true,
          showNotesPanel: true,
        },
        createElement(Summary, {
          customColumns: [],
          customFieldValues: [],
          entityId: "deal-1",
          fields: ids.map((id) => ({ id, label: id, value: id })),
        }),
      ),
    );

    const rail = container.querySelector<HTMLElement>("[data-summary-rail]");
    const alignedGrid = container.querySelector<HTMLElement>("[data-summary-aligned-grid]");
    const cells = [...container.querySelectorAll<HTMLElement>("[data-summary-cell]")];
    const dividers = [...container.querySelectorAll<HTMLElement>("[data-summary-panel-divider]")];
    const overflowCells = [...container.querySelectorAll<HTMLElement>('[data-summary-overflow="true"]')];

    expect(rail?.dataset.summaryGeometry).toBe("details-notes-activities");
    expect(rail?.classList.contains("@6xl/detail:w-full")).toBe(true);
    expect(rail?.parentElement?.classList.contains("@6xl/detail:px-0")).toBe(true);
    expect(alignedGrid?.classList.contains("@6xl/detail:flex-none")).toBe(true);
    expect(alignedGrid?.classList.contains("@6xl/detail:w-full")).toBe(true);
    expect(alignedGrid?.style.gridTemplateColumns).toContain("repeat(4, minmax(0, 9fr))");
    expect(cells.map((cell) => cell.style.gridColumn)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "6",
      "7",
      "8",
      "10",
      "11",
      "12",
      "",
      "",
    ]);
    expect(dividers.map((divider) => divider.style.gridColumn)).toEqual(["5", "9"]);
    expect(cells[4]?.classList.contains("@6xl/detail:border-l-0")).toBe(true);
    expect(cells[7]?.classList.contains("@6xl/detail:border-l-0")).toBe(true);
    expect(alignedGrid?.querySelectorAll("[data-summary-cell]")).toHaveLength(10);
    expect(overflowCells).toEqual(cells.slice(10));
    expect(overflowCells.every((cell) => !cell.classList.contains("@6xl/detail:w-auto"))).toBe(true);
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

  it("keeps short favorite text out of the keyboard order without a redundant tooltip", () => {
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

  it("does not render an empty favorites row", () => {
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
  it("uses the shared muted read-only field treatment and exposes its inline favorite control", () => {
    const container = mount(
      createElement(EntityDetailStaticField, {
        fieldId: "createdAt",
        label: "Created at",
        value: "",
      }),
    );

    expect(container.querySelector('[data-star="createdAt"]')).not.toBeNull();
    expect(container.textContent).toContain("—");
    const value = container.querySelector<HTMLElement>('[data-read-only="true"]');
    expect(value).not.toBeNull();
    expect(value?.classList.contains("border-input")).toBe(true);
    expect(value?.classList.contains("bg-muted")).toBe(true);
    expect(value?.classList.contains("bg-input-background")).toBe(false);
    expect(value?.querySelector(".select-text")).not.toBeNull();
    expect(value?.querySelector("input")).toBeNull();
  });
});
