import type { ReactElement, ReactNode } from "react";
import type { Root } from "react-dom/client";

import { Children, act, createElement, isValidElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EntityType } from "@/generated/prisma";

const harness = vi.hoisted(() => ({
  loadById: vi.fn(),
  pageStateProps: vi.fn(),
  setTopBarActions: vi.fn(),
  canReadHistory: false,
  personalizationEnabled: false,
  isPersonalizing: false,
  setIsPersonalizing: vi.fn(),
  starredFieldIds: [] as string[],
  drawerStack: [] as { entityType: string; id: string }[],
  useAgentRecordContext: vi.fn(),
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
  useEntityDrawerStack: () => ({ stack: harness.drawerStack }),
}));

vi.mock("@/app/components/agent-chat/use-agent-record-context", () => ({
  useAgentRecordContext: harness.useAgentRecordContext,
}));

vi.mock("../entity-detail-personalization", () => ({
  useEntityDetailPersonalization: () => ({
    enabled: harness.personalizationEnabled,
    isPersonalizing: harness.isPersonalizing,
    starredFieldIds: harness.starredFieldIds,
    setIsPersonalizing: harness.setIsPersonalizing,
  }),
  useEntityDetailCustomization: ({
    canManage,
    isEditingCustomField,
    toggleEditingCustomField,
  }: {
    canManage: boolean;
    isEditingCustomField: boolean;
    toggleEditingCustomField: () => void;
  }) => {
    const isCustomizing = harness.personalizationEnabled
      ? harness.isPersonalizing || (canManage && isEditingCustomField)
      : canManage && isEditingCustomField;

    return {
      isCustomizing,
      onToggleCustomization: () => {
        const next = !isCustomizing;
        if (harness.personalizationEnabled) harness.setIsPersonalizing(next);
        if (canManage && isEditingCustomField !== next) toggleEditingCustomField();
      },
    };
  },
}));

vi.mock("@/components/entity-detail/entity-notes-panel", () => ({
  EntityNotesPanel: () => createElement("div", { "data-notes-panel": true }),
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    agentChatStore: {},
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

function layout(
  state: DetailState,
  {
    canManage = false,
    isEditingCustomField = false,
    serverSnapshotApplied = true,
    showNotesPanel = true,
    summary,
  }: {
    canManage?: boolean;
    isEditingCustomField?: boolean;
    serverSnapshotApplied?: boolean;
    showNotesPanel?: boolean;
    summary?: ReactNode;
  } = {},
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

  const element = createElement(EntityDetailLayout, {
    canDelete: true,
    entityId,
    entityType: EntityType.contact,
    fallbackTitle: "Contact",
    historyPanel: createElement("div", { "data-history": true }),
    identity: { name: "Ada Lovelace" },
    masterData: createElement("div", { "data-master-data": true }),
    serverSnapshotApplied,
    showNotesPanel,
    store: store as never,
    summary,
  });

  return { element, store };
}

function renderState(state: DetailState, options: Parameters<typeof layout>[1] = {}) {
  const { element, store } = layout(state, options);

  return { html: renderToStaticMarkup(element), store };
}

const roots: Root[] = [];

function mountContent(options: Parameters<typeof layout>[1] = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(layout("content", options).element));

  return container;
}

function panelSemantics(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>("[data-detail-panel]")].map((panel) => ({
    panel: panel.dataset.detailPanel,
    role: panel.getAttribute("role"),
    label: panel.getAttribute("aria-label"),
    labelledBy: panel.getAttribute("aria-labelledby"),
  }));
}

function setSwitcherDisplay(container: HTMLElement, display: string) {
  const switcher = container.querySelector<HTMLElement>("[data-detail-panel-switcher]");
  if (!switcher) throw new Error("Expected the compact panel switcher");

  act(() => {
    switcher.style.display = display;
    window.dispatchEvent(new Event("resize"));
  });
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
  afterEach(() => {
    act(() => roots.splice(0).forEach((root) => root.unmount()));
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    harness.canReadHistory = false;
    harness.personalizationEnabled = false;
    harness.isPersonalizing = false;
    harness.starredFieldIds = [];
    harness.drawerStack = [];
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
    const { html, store } = renderState("content", {
      serverSnapshotApplied: false,
    });

    expect(store.hydrate).not.toHaveBeenCalled();
    expect(html).toContain('data-page-state="loading"');
    expect(html).not.toContain('data-master-data="true"');
  });

  it("registers the loaded full-page record and disables it while a drawer owns the active context", () => {
    renderState("content");

    expect(harness.useAgentRecordContext).toHaveBeenLastCalledWith({
      enabled: true,
      entityType: EntityType.contact,
      recordId: "contact-1",
      name: "Ada Lovelace",
    });

    harness.drawerStack = [{ entityType: "deal", id: "deal-1" }];
    renderState("content");

    expect(harness.useAgentRecordContext).toHaveBeenLastCalledWith({
      enabled: false,
      entityType: EntityType.contact,
      recordId: "contact-1",
      name: "Ada Lovelace",
    });
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
    const tabClasses = html.match(/role="tab"[^>]*class="([^"]+)"/)?.[1].split(" ") ?? [];
    expect(tabClasses).toContain("group-data-[orientation=horizontal]/tabs:after:-bottom-px");
    expect(tabClasses).not.toContain("group-data-[orientation=horizontal]/tabs:after:bottom-[-5px]");
    expect(html).toContain("EntityDetail.overview");
    expect(html).toContain("EntityDetail.sections.notes");
    expect(html).toContain("EntityTimeline.types.activities");
    expect(html).toContain("@6xl/detail:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_360px]");
  });

  it.each([
    ["notes and history", true, true],
    ["notes only", true, false],
    ["history only", false, true],
    ["neither notes nor history", false, false],
  ] as const)("points every panel and tab reference at a rendered id with %s", (_, showNotesPanel, canReadHistory) => {
    harness.canReadHistory = canReadHistory;

    const { html } = renderState("content", { showNotesPanel });
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
    const references = [...html.matchAll(/\saria-(?:controls|labelledby)="([^"]+)"/g)].flatMap((match) =>
      match[1].split(" "),
    );

    expect(references.filter((reference) => !ids.has(reference))).toEqual([]);
    expect(html.includes('role="tabpanel"')).toBe(showNotesPanel || canReadHistory);
  });

  it("turns the tab panels into named regions while the wide layout hides the tab switcher", () => {
    harness.canReadHistory = true;
    const container = mountContent();
    const tabIds = [...container.querySelectorAll('[role="tab"]')].map((tab) => tab.id);

    expect(panelSemantics(container)).toEqual([
      { panel: "details", role: "tabpanel", label: null, labelledBy: tabIds[0] },
      { panel: "notes", role: "tabpanel", label: null, labelledBy: tabIds[1] },
      { panel: "activities", role: "tabpanel", label: null, labelledBy: tabIds[2] },
    ]);

    setSwitcherDisplay(container, "none");

    expect(container.querySelector('[role="tabpanel"]')).toBeNull();
    expect(panelSemantics(container)).toEqual([
      { panel: "details", role: "region", label: "EntityDetail.overview", labelledBy: null },
      { panel: "notes", role: "region", label: "EntityDetail.sections.notes", labelledBy: null },
      { panel: "activities", role: "region", label: "Common.actions.labelHistory", labelledBy: null },
    ]);

    setSwitcherDisplay(container, "");

    expect(panelSemantics(container).map(({ role }) => role)).toEqual(["tabpanel", "tabpanel", "tabpanel"]);
  });

  it("follows the switcher through a ResizeObserver and stops observing on unmount", () => {
    const observers: { callback: () => void; observed: Element[]; disconnect: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        callback: () => void;
        observed: Element[] = [];
        disconnect = vi.fn();

        constructor(callback: () => void) {
          this.callback = callback;
          observers.push(this);
        }

        observe(element: Element) {
          this.observed.push(element);
        }
      },
    );
    harness.canReadHistory = true;
    const container = mountContent();
    const switcher = container.querySelector<HTMLElement>("[data-detail-panel-switcher]");
    const observer = observers.find((candidate) => candidate.observed.includes(switcher as Element));

    expect(observer).toBeDefined();

    act(() => {
      if (switcher) switcher.style.display = "none";
      observer?.callback();
    });

    expect(panelSemantics(container).map(({ role }) => role)).toEqual(["region", "region", "region"]);

    act(() => roots.splice(0).forEach((root) => root.unmount()));

    expect(observer?.disconnect).toHaveBeenCalled();
  });

  it("keeps a lone details panel free of tab and region roles", () => {
    const container = mountContent({ showNotesPanel: false });

    expect(container.querySelector("[data-detail-panel-switcher]")).toBeNull();
    expect(panelSemantics(container)).toEqual([{ panel: "details", role: null, label: null, labelledBy: null }]);
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

  it("keeps text actions from sm upward and exposes compact labelled controls on phones", () => {
    renderState("content", { canManage: true });
    const actions = harness.setTopBarActions.mock.calls.at(-1)?.[0] as ReactNode;
    const deleteAction = findElementByProp(actions, "id", "entity-delete");
    const saveAction = findElementByProp(actions, "id", "entity-save");

    expect(deleteAction).toBeDefined();
    expect(deleteAction?.props).toMatchObject({
      "aria-label": "Common.actions.delete",
      className: "h-8 text-destructive hover:text-destructive",
      size: "sm",
      variant: "secondary",
    });
    expect(saveAction?.props).toMatchObject({
      "aria-label": "Common.actions.save",
      className: "h-8",
      size: "sm",
    });

    const actionMarkup = renderToStaticMarkup(createElement("div", null, deleteAction, saveAction));
    expect(actionMarkup).toContain("sm:hidden");
    expect(actionMarkup).toContain("hidden sm:inline");
    expect(actionMarkup).toContain("Common.actions.delete");
    expect(actionMarkup).toContain("Common.actions.save");
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
