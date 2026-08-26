import type { Root } from "react-dom/client";
import type { ComponentType, ReactNode } from "react";
import type { EntityDetailSummaryField } from "../entity-detail-summary";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomColumnType, EntityType } from "@/generated/prisma";

const harness = vi.hoisted(() => ({ starredFieldIds: [] as string[] }));

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
vi.mock("@/components/data-view/custom-columns/custom-field-value", () => ({
  CustomFieldValue: ({ column }: { column: { id: string } }) =>
    createElement("span", { "data-custom-value": column.id }, `Value for ${column.id}`),
}));

import { EntityDetailSummary, previewItems } from "../entity-detail-summary";
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
