import type { ReactElement, ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EntityType } from "@/generated/prisma";

const harness = vi.hoisted(() => ({
  loadById: vi.fn(),
  pageStateProps: vi.fn(),
  setTopBarActions: vi.fn(),
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

vi.mock("@/components/entity-detail/entity-notes-panel", () => ({
  EntityNotesPanel: () => createElement("div", { "data-notes-panel": true }),
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    customColumnModalStore: { initialize: vi.fn(), open: vi.fn() },
    layoutStore: { clearRuntimeIdentity: vi.fn(), setRuntimeIdentity: vi.fn() },
    userStore: { can: vi.fn(() => false) },
  }),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/page-state/page-state", async (importOriginal) => {
  const React = await import("react");
  const actual = await importOriginal<{ PageState: (props: Record<string, unknown>) => ReactElement }>();

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

function renderState(state: DetailState) {
  const entityId = "contact-1";
  const store = {
    canManage: false,
    delete: vi.fn(),
    entityLoadState: state === "content" ? "ready" : state,
    fetchedEntity: state === "content" ? { id: entityId } : null,
    form: { id: entityId },
    hasUnsavedChanges: false,
    isDisabled: false,
    isEditingCustomField: false,
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
      store: store as never,
    }),
  );

  return { html, store };
}

describe("EntityDetailLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
