import type { Root } from "react-dom/client";
import type { ComponentType, ReactNode } from "react";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { EntityDetailPersonalizationConfig } from "../entity-detail-personalization";

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
  useTranslations: () => (key: string) => key,
}));

import {
  EntityDetailPersonalizationProvider,
  resetEntityDetailPersonalizationPersistenceForTests,
} from "../entity-detail-personalization";
import { EntityDetailCustomFieldsSection } from "../entity-detail-custom-fields-section";
import { EntityDetailSectionGroup } from "../entity-detail-section";

const columnId = "10000000-0000-4000-8000-000000000001";
const roots = new Set<Root>();
const TestProvider = EntityDetailPersonalizationProvider as ComponentType<{
  children?: ReactNode;
  config: EntityDetailPersonalizationConfig;
  customColumnIds?: string[];
  persistenceScope: string;
}>;
const TestSectionGroup = EntityDetailSectionGroup as ComponentType<{ children?: ReactNode }>;
const oneColumn: CustomColumnDto[] = [
  { id: columnId, entityType: EntityType.contact, label: "Industry", type: CustomColumnType.plain },
];

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
        defaultCollapsedSectionIds: [],
        sectionIds: ["customFields"],
      },
      customColumnIds: columns.map((column) => column.id),
      persistenceScope: "user-1",
    },
    createElement(
      TestSectionGroup,
      null,
      createElement(EntityDetailCustomFieldsSection, {
        canManage,
        columns,
        entityType: EntityType.contact,
        isEditing,
        sectionId: "customFields",
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
});

afterEach(() => {
  act(() => roots.forEach((root) => root.unmount()));
  roots.clear();
  document.body.replaceChildren();
});

describe("entity detail custom fields empty state", () => {
  it("explains the absence and offers the first field without entering edit mode", () => {
    const { container } = mount(view({}));
    const emptyState = container.querySelector<HTMLElement>('[data-slot="empty-state"]');
    const button = container.querySelector<HTMLButtonElement>("[data-entity-add-custom-field]");

    expect(emptyState?.closest('[data-detail-section-content="customFields"]')).not.toBeNull();
    expect(emptyState?.textContent).toContain("EntityDetail.customFieldsEmpty.title");
    expect(emptyState?.textContent).toContain("EntityDetail.customFieldsEmpty.body");
    expect(container.querySelector("[data-custom-field-inputs]")).toBeNull();
    expect(button).not.toBeNull();
    expect(button?.closest('[data-detail-section-content="customFields"]')).not.toBeNull();

    act(() => button?.click());

    expect(customColumnModalStore.initialize).toHaveBeenCalledWith(CustomColumnType.plain, EntityType.contact);
    expect(customColumnModalStore.open).toHaveBeenCalledOnce();
  });

  it("keeps the explanation but hides the action without manage permission", () => {
    const { container } = mount(view({ canManage: false }));

    expect(container.querySelector('[data-slot="empty-state"]')).not.toBeNull();
    expect(container.querySelector("[data-entity-add-custom-field]")).toBeNull();
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
});
