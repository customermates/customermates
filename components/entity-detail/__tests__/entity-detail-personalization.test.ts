import type { ComponentType, ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const customColumnModalStore = vi.hoisted(() => ({
  initialize: vi.fn(),
  open: vi.fn(),
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ customColumnModalStore }),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { section?: string; name?: string }) =>
    values?.section ? `${key}:${values.section}` : values?.name ? `${key}: ${values.name}` : key,
}));

import { FormControlRow } from "@/components/forms/form-control-row";
import { EntityDetailFieldDragHandle, EntityDetailFields } from "../entity-detail-fields";
import { useEntityDetailPersonalization } from "../entity-detail-personalization";
import { resolveDetailFieldOrder } from "../entity-detail-personalization.utils";
import { PersonalizationHarness } from "./personalization-harness";

const firstId = "10000000-0000-4000-8000-000000000001";
const secondId = "10000000-0000-4000-8000-000000000002";
const thirdId = "10000000-0000-4000-8000-000000000003";
const roots = new Set<Root>();
const TestControlRow = FormControlRow as ComponentType<{
  children?: ReactNode;
  startAddon?: ReactNode;
}>;

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
  customColumnModalStore.initialize.mockReset();
  customColumnModalStore.open.mockReset();
});

afterEach(() => {
  act(() => roots.forEach((root) => root.unmount()));
  roots.clear();
  document.body.replaceChildren();
});

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
        PersonalizationHarness,
        null,
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
                    startAddon: createElement(EntityDetailFieldDragHandle, {
                      label: "Name",
                    }),
                  },
                  createElement("textarea", {
                    id: "name",
                    defaultValue: "Original",
                  }),
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
    expect(handle?.getAttribute("aria-label")).toBe("DataView.dragToReorderNamed: Name");
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

describe("entity detail field order", () => {
  it("reorders standard and custom inputs together without losing drafts", () => {
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
    const { container } = mountNode(
      createElement(
        PersonalizationHarness,
        null,
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
  });

  it("inserts new fields before timestamps while preserving the saved order", () => {
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
