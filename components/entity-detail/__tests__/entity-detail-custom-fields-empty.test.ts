import type { Root } from "react-dom/client";
import type { ComponentType, ReactNode } from "react";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { EntityDetailPersonalizationConfig } from "../entity-detail-personalization";

import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomColumnType, EntityType } from "@/generated/prisma";

const upsertP13nAction = vi.hoisted(() => vi.fn());
const customColumnModalStore = vi.hoisted(() => ({
  initialize: vi.fn(),
  open: vi.fn(),
}));
const toggleEditing = vi.hoisted(() => vi.fn());

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
  useCustomFieldInputs: ({ columns }: { columns: CustomColumnDto[] }) =>
    columns.map((column) => ({
      id: column.id,
      content: createElement("input", { "data-custom-field-inputs": true, defaultValue: column.label }),
    })),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import {
  EntityDetailPersonalizationProvider,
  resetEntityDetailPersonalizationPersistenceForTests,
  useEntityDetailCustomization,
} from "../entity-detail-personalization";
import { EntityDetailOverview } from "../entity-detail-overview";

const columnId = "10000000-0000-4000-8000-000000000001";
const roots = new Set<Root>();
const TestProvider = EntityDetailPersonalizationProvider as ComponentType<{
  children?: ReactNode;
  config: EntityDetailPersonalizationConfig;
  customColumnIds?: string[];
  persistenceScope: string;
}>;
const oneColumn: CustomColumnDto[] = [
  {
    id: columnId,
    entityType: EntityType.contact,
    label: "Industry",
    type: CustomColumnType.plain,
  },
];

function CustomizationJourney() {
  const [isEditing, setIsEditing] = useState(false);
  const onToggleEditing = () => setIsEditing((current) => !current);
  const { isCustomizing, onToggleCustomization } = useEntityDetailCustomization({
    canManage: true,
    isEditingCustomField: isEditing,
    toggleEditingCustomField: onToggleEditing,
  });

  return createElement(
    "div",
    null,
    createElement(
      "button",
      {
        "data-test-top-customization": true,
        "data-active": isCustomizing,
        onClick: onToggleCustomization,
      },
      "Customize",
    ),
    createElement(EntityDetailOverview, {
      canManage: true,
      columns: oneColumn,
      entityType: EntityType.contact,
      isEditing,
      onToggleEditing,
      fields: [],
    }),
  );
}

function view({
  canManage = true,
  columns = [] as CustomColumnDto[],
  isEditing = false,
}: {
  canManage?: boolean;
  columns?: CustomColumnDto[];
  isEditing?: boolean;
}) {
  return createElement(
    TestProvider,
    {
      config: {
        p13nId: "contact-detail",
        defaultStarredFieldIds: [],
      },
      customColumnIds: columns.map((column) => column.id),
      persistenceScope: "user-1",
    },
    createElement(
      "div",
      null,
      createElement(EntityDetailOverview, {
        canManage,
        columns,
        entityType: EntityType.contact,
        isEditing,
        onToggleEditing: toggleEditing,
        fields: [],
      }),
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
  resetEntityDetailPersonalizationPersistenceForTests();
  upsertP13nAction.mockReset();
  upsertP13nAction.mockResolvedValue({ ok: true, data: {} });
  customColumnModalStore.initialize.mockReset();
  customColumnModalStore.open.mockReset();
  toggleEditing.mockReset();
});

afterEach(() => {
  act(() => roots.forEach((root) => root.unmount()));
  roots.clear();
  document.body.replaceChildren();
});

describe("entity detail custom fields empty state", () => {
  it("offers the first field without an empty-state section or edit mode", () => {
    const { container } = mount(view({}));
    const emptyState = container.querySelector<HTMLElement>('[data-slot="empty-state"]');
    const button = container.querySelector<HTMLButtonElement>("[data-entity-add-custom-field]");

    expect(emptyState).toBeNull();
    expect(container.querySelector("[data-detail-section-trigger]")).toBeNull();
    expect(container.querySelector("[data-custom-field-inputs]")).toBeNull();
    expect(button).not.toBeNull();
    expect(button?.closest("[data-entity-overview]")).not.toBeNull();

    act(() => button?.click());

    expect(customColumnModalStore.initialize).toHaveBeenCalledWith(CustomColumnType.plain, EntityType.contact);
    expect(customColumnModalStore.open).toHaveBeenCalledOnce();
  });

  it("renders no empty-state section or management actions without manage permission", () => {
    const { container } = mount(view({ canManage: false }));

    expect(container.querySelector('[data-slot="empty-state"]')).toBeNull();
    expect(container.querySelector("[data-entity-add-custom-field]")).toBeNull();
    expect(container.querySelector("[data-entity-custom-fields-mode-toggle]")).toBeNull();
  });

  it("renders the fields instead of the empty state once a custom column exists", () => {
    const { container } = mount(view({ columns: oneColumn }));

    expect(container.querySelector('[data-slot="empty-state"]')).toBeNull();
    expect(container.querySelector("[data-custom-field-inputs]")).not.toBeNull();
    expect(container.querySelector("[data-entity-add-custom-field]")).toBeNull();
  });

  it("keeps the in-edit add action for a populated section", () => {
    const { container } = mount(view({ columns: oneColumn, isEditing: true }));

    expect(container.querySelector('[data-slot="empty-state"]')).toBeNull();
    expect(container.querySelector("[data-entity-add-custom-field]")).not.toBeNull();
  });

  it("offers a bordered, subdued Customize toggle matching the header at the bottom", () => {
    const { container } = mount(view({ columns: oneColumn }));
    const content = container.querySelector<HTMLElement>("[data-entity-overview]");
    const toggle = container.querySelector<HTMLButtonElement>("[data-entity-custom-fields-mode-toggle]");

    expect(toggle).not.toBeNull();
    expect(toggle?.dataset.variant).toBe("field");
    expect(toggle?.dataset.size).toBe("default");
    expect(toggle?.classList.contains("bg-transparent")).toBe(true);
    expect(toggle?.classList.contains("shadow-none")).toBe(true);
    expect(toggle?.getAttribute("aria-pressed")).toBe("false");
    expect(toggle?.textContent).toContain("EntityDetail.personalize");
    expect(toggle?.getAttribute("aria-label")).toBe("EntityDetail.personalize");
    expect(toggle?.closest("[data-entity-overview]")).toBe(content);
    expect(toggle?.parentElement?.lastElementChild).toBe(toggle);

    act(() => toggle?.click());

    expect(toggleEditing).toHaveBeenCalledOnce();
  });

  it("turns the footer toggle into a Done action matching the header while editing", () => {
    const { container } = mount(view({ columns: oneColumn, isEditing: true }));
    const content = container.querySelector<HTMLElement>("[data-entity-overview]");
    const add = container.querySelector<HTMLButtonElement>("[data-entity-add-custom-field]");
    const toggle = container.querySelector<HTMLButtonElement>("[data-entity-custom-fields-mode-toggle]");

    expect(toggle?.getAttribute("aria-pressed")).toBe("true");
    expect(toggle?.textContent).toContain("EntityDetail.donePersonalizing");
    expect(toggle?.getAttribute("aria-label")).toBe("EntityDetail.donePersonalizing");
    expect(toggle?.closest("[data-entity-overview]")).toBe(content);
    expect(toggle?.parentElement?.lastElementChild).toBe(toggle);
    expect(add?.nextElementSibling).toBe(toggle);

    act(() => toggle?.click());

    expect(toggleEditing).toHaveBeenCalledOnce();
  });

  it("leaves personalization and field editing together when finishing from the footer", () => {
    const { container } = mount(
      createElement(
        TestProvider,
        {
          config: {
            p13nId: "contact-detail",
            defaultStarredFieldIds: [],
          },
          customColumnIds: [columnId],
          persistenceScope: "user-1",
        },
        createElement(CustomizationJourney),
      ),
    );
    const top = container.querySelector<HTMLButtonElement>("[data-test-top-customization]");

    act(() => top?.click());

    const done = container.querySelector<HTMLButtonElement>("[data-entity-custom-fields-mode-toggle]");
    expect(top?.dataset.active).toBe("true");
    expect(done?.textContent).toContain("EntityDetail.donePersonalizing");

    act(() => done?.click());

    expect(top?.dataset.active).toBe("false");
    expect(done?.textContent).toContain("EntityDetail.personalize");
  });
});
