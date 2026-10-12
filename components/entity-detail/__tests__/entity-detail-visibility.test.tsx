import type { ComponentType, ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EntityDetailField } from "../entity-detail-field";
import { EntityDetailFieldActions } from "../entity-detail-field-actions";
import { useEntityDetailPersonalization } from "../entity-detail-personalization";
import { PersonalizationHarness } from "./personalization-harness";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { field?: string }) => `${key}:${values?.field ?? ""}`,
}));
vi.mock("@/components/ui/icon-button", () => ({
  IconButton: ({
    disabled,
    label,
    onClick,
    pressed,
  }: {
    disabled?: boolean;
    label: string;
    onClick: () => void;
    pressed?: boolean;
  }) =>
    createElement(
      "button",
      {
        "aria-label": label,
        "aria-pressed": pressed,
        disabled,
        type: "button",
        onClick,
      },
      label,
    ),
}));

const roots = new Set<Root>();
const TestField = EntityDetailField as ComponentType<{ fieldId: string; children?: ReactNode }>;

function Controls() {
  const { isPersonalizing, setIsPersonalizing } = useEntityDetailPersonalization();

  return createElement(
    "button",
    {
      "data-personalizing": isPersonalizing,
      type: "button",
      onClick: () => setIsPersonalizing(!isPersonalizing),
    },
    "Customize",
  );
}

function PinnedFields() {
  const { starredFieldIds } = useEntityDetailPersonalization();

  return createElement("output", { "data-pinned-fields": starredFieldIds.join(",") });
}

function view({
  applyFieldVisibility = true,
  hidden = [],
  starred = [],
}: {
  applyFieldVisibility?: boolean;
  hidden?: string[];
  starred?: string[];
}) {
  return createElement(
    PersonalizationHarness,
    { applyFieldVisibility, hidden, starred },
    createElement(Controls),
    createElement(PinnedFields),
    createElement(
      TestField,
      { fieldId: "name" },
      createElement(
        "div",
        { "data-field-content": true },
        createElement("span", null, "Name"),
        createElement(EntityDetailFieldActions, {
          fieldId: "name",
          label: "Name",
        }),
      ),
    ),
  );
}

function mount(node: ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.add(root);
  act(() => root.render(node));
  return { container, root };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => roots.forEach((root) => root.unmount()));
  roots.clear();
  document.body.replaceChildren();
});

describe("entity detail field visibility", () => {
  it("shows pin buttons only while Customize is open", () => {
    const { container } = mount(view({ starred: ["name"] }));

    expect(container.querySelector('[aria-label="EntityDetail.unpinField:Name"]')).toBeNull();
    expect(container.querySelector('[aria-label="EntityDetail.pinField:Name"]')).toBeNull();
    expect(container.querySelector("[data-pinned-fields]")?.getAttribute("data-pinned-fields")).toBe("name");

    act(() => container.querySelector<HTMLButtonElement>("[data-personalizing]")?.click());

    expect(container.querySelector('[aria-label="EntityDetail.unpinField:Name"]')).not.toBeNull();
  });

  it("keeps hidden fields restorable in Customize and removes them from the normal detail view", () => {
    const { container } = mount(view({ hidden: ["name"] }));

    expect(container.querySelector("[data-field-content]")).toBeNull();
    expect(container.querySelector("[data-pinned-fields]")?.getAttribute("data-pinned-fields")).toBe("");

    act(() => container.querySelector<HTMLButtonElement>("[data-personalizing]")?.click());

    expect(container.querySelector('[data-entity-field="name"]')?.getAttribute("data-field-hidden")).toBe("true");
    expect(container.querySelector('[data-entity-field="name"]')?.className).toContain("opacity-50");
    expect(container.querySelector<HTMLButtonElement>('[aria-label="EntityDetail.pinField:Name"]')?.disabled).toBe(
      false,
    );
    expect(container.querySelector('[aria-label="EntityDetail.showField:Name"]')).not.toBeNull();
  });

  it("hides a pinned field without removing it from the overview", () => {
    const { container } = mount(view({ starred: ["name"] }));

    act(() => container.querySelector<HTMLButtonElement>("[data-personalizing]")?.click());
    expect(container.querySelector('[aria-label="EntityDetail.unpinField:Name"]')).not.toBeNull();
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="EntityDetail.hideField:Name"]')?.click());
    act(() => container.querySelector<HTMLButtonElement>("[data-personalizing]")?.click());

    expect(container.querySelector("[data-field-content]")).toBeNull();
    expect(container.querySelector("[data-pinned-fields]")?.getAttribute("data-pinned-fields")).toBe("name");
  });

  it("allows a hidden field to be pinned while Customize is open", () => {
    const { container } = mount(view({ hidden: ["name"] }));

    act(() => container.querySelector<HTMLButtonElement>("[data-personalizing]")?.click());
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="EntityDetail.pinField:Name"]')?.click());

    expect(container.querySelector('[aria-label="EntityDetail.unpinField:Name"]')).not.toBeNull();
    expect(container.querySelector("[data-pinned-fields]")?.getAttribute("data-pinned-fields")).toBe("name");
  });

  it("does not apply saved visibility while creating a new record", () => {
    const { container } = mount(view({ applyFieldVisibility: false, hidden: ["name"] }));

    expect(container.querySelector("[data-field-content]")).not.toBeNull();
    expect(container.querySelector('[data-entity-field="name"]')?.hasAttribute("data-field-hidden")).toBe(false);
  });
});
