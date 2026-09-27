import type * as EntityDetailPersonalizationModule from "../entity-detail-personalization";
import type * as EntityDetailFieldModule from "../entity-detail-field";
import type * as EntityDetailFieldActionsModule from "../entity-detail-field-actions";
import type { Root } from "react-dom/client";
import type { ComponentType, ReactNode } from "react";
import type { EntityDetailPersonalizationConfig } from "../entity-detail-personalization";
import type { P13nEntry } from "@/features/p13n/prisma-p13n.repository";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upsertP13nAction = vi.hoisted(() => vi.fn());

vi.mock("@/app/actions", () => ({ upsertP13nAction }));
vi.mock("@/core/errors/report-application-error", () => ({
  reportApplicationError: vi.fn(),
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({
  toastZodErrorTree: vi.fn(),
}));
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
const config: EntityDetailPersonalizationConfig = {
  p13nId: "contact-detail",
  defaultStarredFieldIds: [],
  availableFieldIds: ["name"],
};
type TestProviderProps = {
  applyFieldVisibility?: boolean;
  children?: ReactNode;
  config: EntityDetailPersonalizationConfig;
  initial?: P13nEntry | null;
  persistenceScope: string;
};
type TestFieldProps = {
  children?: ReactNode;
  fieldId: string;
};

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
    TestProvider,
    {
      applyFieldVisibility,
      config,
      initial: {
        p13nId: config.p13nId,
        detailOptions: {
          collapsedSectionIds: [],
          hiddenFieldIds: hidden,
          starredFieldIds: starred,
        },
      },
      persistenceScope: "user-1",
    },
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

let TestProvider: ComponentType<TestProviderProps>;
let EntityDetailPersonalizationProvider: typeof EntityDetailPersonalizationModule.EntityDetailPersonalizationProvider;
let useEntityDetailPersonalization: typeof EntityDetailPersonalizationModule.useEntityDetailPersonalization;
let TestField: ComponentType<TestFieldProps>;
let EntityDetailField: typeof EntityDetailFieldModule.EntityDetailField;
let EntityDetailFieldActions: typeof EntityDetailFieldActionsModule.EntityDetailFieldActions;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.resetModules();
  ({ EntityDetailPersonalizationProvider, useEntityDetailPersonalization } = await import(
    "../entity-detail-personalization"
  ));
  TestProvider = EntityDetailPersonalizationProvider as ComponentType<TestProviderProps>;
  ({ EntityDetailField } = await import("../entity-detail-field"));
  TestField = EntityDetailField as ComponentType<TestFieldProps>;
  ({ EntityDetailFieldActions } = await import("../entity-detail-field-actions"));
  upsertP13nAction.mockReset();
  upsertP13nAction.mockResolvedValue({ ok: true, data: {} });
});

afterEach(() => {
  act(() => roots.forEach((root) => root.unmount()));
  roots.clear();
  document.body.replaceChildren();
});

describe("entity detail field visibility", () => {
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

  it("hides a pinned field without removing it from the overview", async () => {
    const { container, root } = mount(view({ starred: ["name"] }));

    act(() => container.querySelector<HTMLButtonElement>("[data-personalizing]")?.click());
    expect(container.querySelector('[aria-label="EntityDetail.unpinField:Name"]')).not.toBeNull();
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="EntityDetail.hideField:Name"]')?.click());
    act(() => container.querySelector<HTMLButtonElement>("[data-personalizing]")?.click());

    expect(container.querySelector("[data-field-content]")).toBeNull();
    expect(container.querySelector("[data-pinned-fields]")?.getAttribute("data-pinned-fields")).toBe("name");

    act(() => root.unmount());
    roots.delete(root);
    await act(async () => Promise.resolve());

    expect(upsertP13nAction).toHaveBeenCalledExactlyOnceWith({
      p13nId: "contact-detail",
      detailOptions: {
        collapsedSectionIds: [],
        hiddenFieldIds: ["name"],
        starredFieldIds: ["name"],
      },
      columnOrder: [],
    });
  });

  it("allows a hidden field to be pinned while Customize is open", async () => {
    const { container, root } = mount(view({ hidden: ["name"] }));

    act(() => container.querySelector<HTMLButtonElement>("[data-personalizing]")?.click());
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="EntityDetail.pinField:Name"]')?.click());

    expect(container.querySelector('[aria-label="EntityDetail.unpinField:Name"]')).not.toBeNull();

    act(() => root.unmount());
    roots.delete(root);
    await act(async () => Promise.resolve());

    expect(upsertP13nAction).toHaveBeenCalledExactlyOnceWith({
      p13nId: "contact-detail",
      detailOptions: {
        collapsedSectionIds: [],
        hiddenFieldIds: ["name"],
        starredFieldIds: ["name"],
      },
      columnOrder: [],
    });
  });

  it("does not apply saved visibility while creating a new record", () => {
    const { container } = mount(view({ applyFieldVisibility: false, hidden: ["name"] }));

    expect(container.querySelector("[data-field-content]")).not.toBeNull();
    expect(container.querySelector('[data-entity-field="name"]')?.hasAttribute("data-field-hidden")).toBe(false);
  });
});
