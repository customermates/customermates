import type { ReactElement, ReactNode } from "react";

import { Children, createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EntityType } from "@/generated/prisma";

const harness = vi.hoisted(() => ({
  loadById: vi.fn(),
  pageStateProps: vi.fn(),
  setTopBarActions: vi.fn(),
  canReadHistory: false,
  personalizationEnabled: false,
  isPersonalizing: false,
  setIsPersonalizing: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/app/components/topbar-actions-context", () => ({
  useSetTopBarActions: harness.setTopBarActions,
}));

vi.mock("@/components/forms/form-context", () => ({
  AppForm: ({ children }: { children: ReactNode }) => createElement("div", { "data-app-form": true }, children),
}));

vi.mock("@/components/modal/hooks/use-delete-confirmation", () => ({
  useDeleteConfirmation: () => ({ showDeleteConfirmation: vi.fn() }),
}));

vi.mock("@/components/entity-detail/hooks/use-entity-drawer-stack", () => ({
  useEntityDrawerStack: () => ({ stack: [] }),
}));

vi.mock("../entity-detail-personalization", () => ({
  useEntityDetailPersonalization: () => ({
    enabled: harness.personalizationEnabled,
    isPersonalizing: harness.isPersonalizing,
    starredFieldIds: [],
    setIsPersonalizing: harness.setIsPersonalizing,
  }),
}));

vi.mock("@/components/entity-detail/entity-notes-panel", () => ({
  EntityNotesPanel: () => createElement("div", { "data-notes-panel": true }),
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    customColumnModalStore: { initialize: vi.fn(), open: vi.fn() },
    layoutStore: { clearRuntimeIdentity: vi.fn(), setRuntimeIdentity: vi.fn() },
    userStore: { can: vi.fn(() => harness.canReadHistory) },
  }),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/page-state/page-state", async (importOriginal) => {
  const React = await import("react");
  const actual = await importOriginal<{
    PageState: (props: Record<string, unknown>) => ReactElement;
  }>();

  return {
    ...actual,
    PageState: (props: Record<string, unknown>) => {
      harness.pageStateProps(props);
      return React.createElement(actual.PageState, props);
    },
  };
});

import { EntityDetailLayout } from "../entity-detail-layout";

type DetailState = "loading" | "not-found" | "error" | "content";

function renderState(
  state: DetailState,
  { canManage = false, isEditingCustomField = false, serverSnapshotApplied = true } = {},
) {
  const entityId = "contact-1";
  const store: Record<string, any> = {
    canManage,
    delete: vi.fn(),
    entityLoadState: state === "content" ? "ready" : state,
    fetchedEntity: state === "content" ? { id: entityId } : null,
    form: { id: entityId },
    hasUnsavedChanges: false,
    hydrate: vi.fn((entity: { id: string }) => {
      store.fetchedEntity = entity;
      store.entityLoadState = "ready";
      store.form = { ...store.form, id: entity.id };
    }),
    isDisabled: false,
    isEditingCustomField,
    isLoading: false,
    loadById: harness.loadById,
    requestedEntityId: entityId,
    resetForm: vi.fn(),
    toggleEditingCustomField: vi.fn(),
  };

  const html = renderToStaticMarkup(
    createElement(EntityDetailLayout, {
      canDelete: true,
      entityId,
      entityType: EntityType.contact,
      fallbackTitle: "Contact",
      historyPanel: createElement("div", { "data-history": true }),
      identity: { name: "Ada Lovelace" },
      masterData: createElement("div", { "data-master-data": true }),
      serverSnapshotApplied,
      store: store as never,
    }),
  );

  return { html, store };
}

function findElementByProp(node: ReactNode, property: string, value: unknown): ReactElement | undefined {
  if (!isValidElement(node)) return undefined;
  if ((node.props as Record<string, unknown>)[property] === value) return node;

  const children = (node.props as { children?: ReactNode }).children;
  for (const child of Children.toArray(children)) {
    const match = findElementByProp(child, property, value);
    if (match) return match;
  }

  return undefined;
}

describe("EntityDetailLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    harness.canReadHistory = false;
    harness.personalizationEnabled = false;
    harness.isPersonalizing = false;
  });

  it.each([
    ["loading", 'data-page-state="loading"'],
    ["not-found", "PageState.notFoundTitle"],
    ["error", "ErrorCard.title"],
    ["content", 'data-master-data="true"'],
  ] as const)("renders the exhaustive %s branch", (state, expected) => {
    const { html } = renderState(state);

    expect(html).toContain(expected);
    expect(html.includes('data-app-form="true"')).toBe(state === "content");
    expect(html.includes('data-page-state="loading"')).toBe(state === "loading");
    expect(html.includes('data-page-state="error"')).toBe(state === "not-found" || state === "error");
  });

  it("wires the current entity into the error retry", () => {
    renderState("error");
    const errorProps = harness.pageStateProps.mock.calls.find(([props]) => props.state === "error")?.[0];
    const retry = errorProps?.action as ReactElement<{ onClick: () => void }>;

    retry.props.onClick();

    expect(harness.loadById).toHaveBeenCalledWith("contact-1");
  });

  it("does not expose a retained entity before the authoritative server snapshot is applied", () => {
    const { html, store } = renderState("content", { serverSnapshotApplied: false });

    expect(store.hydrate).not.toHaveBeenCalled();
    expect(html).toContain('data-page-state="loading"');
    expect(html).not.toContain('data-master-data="true"');
  });

  it("keeps one details tree and one notes tree while exposing compact panel tabs and the wide three-column grid", () => {
    harness.canReadHistory = true;

    const { html } = renderState("content");

    expect(html.match(/data-master-data="true"/g)).toHaveLength(1);
    expect(html.match(/data-notes-panel="true"/g)).toHaveLength(1);
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(html).toContain('data-variant="line"');
    expect(html).toContain("group-data-[orientation=horizontal]/tabs:h-13");
    expect(html).toContain("border-b border-border bg-background @6xl/detail:hidden");
    expect(html).toContain('data-detail-panel-switcher="true"');
    expect(html).toContain('data-detail-grid="true"');
    expect(html).toContain('data-detail-panel="details"');
    expect(html).toContain('data-detail-panel="notes"');
    const switcherClasses = html.match(/data-detail-panel-switcher="true" class="([^"]+)"/)?.[1].split(" ");
    expect(switcherClasses).not.toContain("border-t");
    expect(html).toContain("after:-bottom-px");
    expect(html).toContain("Common.details");
    expect(html).toContain("EntityDetail.sections.notes");
    expect(html).toContain("EntityTimeline.types.activities");
    expect(html).toContain("@6xl/detail:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_360px]");
  });

  it("uses one Customize control to enter personalization and field editing together", () => {
    harness.personalizationEnabled = true;
    const { store } = renderState("content", { canManage: true });
    const actions = harness.setTopBarActions.mock.calls.at(-1)?.[0] as ReactNode;
    const customize = findElementByProp(actions, "data-entity-customize", true);

    expect(customize).toBeDefined();
    expect(findElementByProp(actions, "id", "entity-edit-fields")).toBeUndefined();
    expect(findElementByProp(actions, "id", "entity-add-custom-field")).toBeUndefined();

    (customize?.props as { onClick: () => void }).onClick();

    expect(harness.setIsPersonalizing).toHaveBeenCalledWith(true);
    expect(store.toggleEditingCustomField).toHaveBeenCalledOnce();
  });

  it("renders Delete as an aligned text action instead of an icon-only control", () => {
    renderState("content", { canManage: true });
    const actions = harness.setTopBarActions.mock.calls.at(-1)?.[0] as ReactNode;
    const deleteAction = findElementByProp(actions, "id", "entity-delete");

    expect(deleteAction).toBeDefined();
    expect(deleteAction?.props).toMatchObject({
      children: "Common.actions.delete",
      className: "h-8 text-destructive hover:text-destructive",
      size: "sm",
      variant: "secondary",
    });
  });

  it("uses the same control to leave both customization modes", () => {
    harness.personalizationEnabled = true;
    harness.isPersonalizing = true;
    const { html, store } = renderState("content", {
      canManage: true,
      isEditingCustomField: true,
    });
    const actions = harness.setTopBarActions.mock.calls.at(-1)?.[0] as ReactNode;
    const customize = findElementByProp(actions, "data-entity-customize", true);

    (customize?.props as { onClick: () => void }).onClick();

    expect(harness.setIsPersonalizing).toHaveBeenCalledWith(false);
    expect(store.toggleEditingCustomField).toHaveBeenCalledOnce();
    expect(html).not.toContain("Common.actions.addCustomField");
  });
});
