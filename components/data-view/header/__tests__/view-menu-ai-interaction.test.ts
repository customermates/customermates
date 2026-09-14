import type { ReactNode } from "react";
import type * as NextIntl from "next-intl";
import type { Root as ReactRoot } from "react-dom/client";
import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import type { Filter } from "@/core/base/base-get.schema";
import type { RootStore } from "@/core/stores/root.store";
import type { AgentViewContext as ViewContext } from "@/app/components/agent-chat/agent-view-context";
import type { FilterPaletteStore as PaletteStore } from "@/components/data-view/filter-palette/filter-palette.store";

import { act, createElement, Fragment } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ALL_VIEW_KEY, SURFACE } from "@/core/data-view/data-view-keys";
import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";
import { APP_LOCALES, type AppLocale } from "@/i18n/locale-registry";
import en from "@/i18n/locales/en.json";
import de from "@/i18n/locales/de.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";
import itMessages from "@/i18n/locales/it.json";

const catalogs = { en, de, es, fr, it: itMessages };

const harness = vi.hoisted(() => ({
  locale: null as AppLocale | null,
  pathname: "/en/contacts",
  agent: {
    enabled: true,
    composerDraft: "",
    isWorking: false,
    queuedPrompt: null as string | null,
    conversationLoadPendingId: null as string | null,
    historyMutationPending: false,
    usage: null as { blockedReason: string } | null,
    sendMessage: vi.fn<(text: string, options?: { pageRoute: string }) => Promise<void>>(),
    openWithDraft: vi.fn<(draft: string) => void>(),
    viewContext: null as unknown as ViewContext,
  },
  palette: null as unknown as PaletteStore,
  sentRoutes: [] as string[],
  request: {
    onCloseAutoFocus: undefined as ((event: Event) => void) | undefined,
    focusReturnTarget: null as HTMLElement | null,
  },
  overlays: new Map<
    string,
    { open: boolean; onOpenChange: (open: boolean) => void; onCloseAutoFocus?: (event: Event) => void }
  >(),
}));

vi.mock("next/navigation", () => ({ usePathname: () => harness.pathname }));
vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof NextIntl>();
  return {
    ...actual,
    useTranslations: () =>
      harness.locale
        ? actual.createTranslator({ locale: harness.locale, messages: catalogs[harness.locale] })
        : (key: string, values?: Record<string, unknown>) =>
            values ? `${key}(${Object.values(values).join(",")})` : key,
  };
});
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ agentChatStore: harness.agent, filterPaletteStore: harness.palette }),
}));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({
    plural: (entity: string) =>
      harness.locale ? catalogs[harness.locale].EntityTerminology.presets.contact.contact.plural : `${entity}s`,
  }),
}));
vi.mock("@/components/entity-terminology/use-column-label", () => ({ useColumnLabel: () => (uid: string) => uid }));
vi.mock("@/components/entity-terminology/use-filter-field-label", () => ({
  useFilterFieldLabel: () => (field: string) => field,
}));
vi.mock("@/components/data-view/filter-palette/filter-palette", () => ({ FilterPalette: () => null }));
vi.mock("@/components/modal", () => ({
  ResponsiveOverlay: ({
    children,
    footer,
    headerAction,
    open,
    trigger,
    onOpenChange,
    onCloseAutoFocus,
  }: {
    children: ReactNode;
    footer?: ReactNode;
    headerAction?: ReactNode;
    open: boolean;
    trigger: { props: { id: string } } & ReactNode;
    onOpenChange: (open: boolean) => void;
    onCloseAutoFocus?: (event: Event) => void;
  }) => {
    const id = trigger.props.id;
    harness.overlays.set(id, { open, onOpenChange, onCloseAutoFocus });
    return createElement(
      "div",
      null,
      createElement("span", { onClick: () => onOpenChange(!open) }, trigger),
      open
        ? createElement(
            "div",
            { "data-overlay": id },
            createElement("header", null, headerAction),
            children,
            createElement("footer", null, footer),
          )
        : null,
    );
  },
}));

vi.mock("@/components/modal/app-modal", () => ({
  AppModal: ({
    children,
    open,
    onCloseAutoFocus,
    focusReturnTarget,
  }: {
    children: ReactNode;
    open: boolean;
    onCloseAutoFocus?: (event: Event) => void;
    focusReturnTarget?: HTMLElement | null;
  }) => {
    harness.request = { onCloseAutoFocus, focusReturnTarget: focusReturnTarget ?? null };
    return open ? createElement("section", { "data-request-dialog": "" }, children) : null;
  },
}));

import { AgentViewContext } from "@/app/components/agent-chat/agent-view-context";
import {
  FILTER_AUTO_APPLY_DELAY_MS,
  FilterPaletteStore,
} from "@/components/data-view/filter-palette/filter-palette.store";
import { FilterPopover } from "@/components/data-view/header/filter-popover";
import { DataViewDisplayOptions } from "@/components/data-view/header/display-options";

const VIEW_ID = "b6319ec8-d1b5-4844-bba4-c8c0ca819214";
const PATHNAME = "/en/contacts";
type Item = { id: string };

function dataViewStore(overrides: Partial<BaseDataViewStore<Item>> = {}): BaseDataViewStore<Item> {
  const store = {
    activeViewKey: VIEW_ID,
    canBoard: false,
    columnsDefinition: [],
    currentGroupableFieldId: "",
    customColumns: [],
    filterableFields: [{ field: "name", operators: [FilterOperatorKey.contains] }],
    filters: [] as Filter[],
    groupableFields: [],
    grouping: undefined,
    hiddenColumns: [],
    isReady: true,
    orderedColumns: [],
    p13nId: SURFACE.contacts,
    setQueryOptions: vi.fn((options: { filters?: Filter[] }) => {
      if (options.filters) store.filters = options.filters;
    }),
    settleViewState: vi.fn(() => Promise.resolve()),
    sortDescriptor: undefined,
    viewMode: ViewMode.table,
    views: [{ id: VIEW_ID, name: "Qualified contacts", position: 0, state: {} }],
    ...overrides,
  };
  return store as unknown as BaseDataViewStore<Item>;
}

let root: ReactRoot | undefined;
let host: HTMLDivElement;
let composer: HTMLTextAreaElement;

function render(children: ReactNode) {
  act(() => root?.render(children));
}

function click(id: string) {
  const button = host.querySelector<HTMLButtonElement>(`#${id}`);
  if (!button) throw new Error(`Missing button: ${id}`);
  act(() => button.click());
}

function finishClose(id: string): Event {
  const callback = harness.overlays.get(id)?.onCloseAutoFocus;
  if (!callback) throw new Error(`Missing close callback: ${id}`);
  const event = new Event("closeAutoFocus", { cancelable: true });
  act(() => callback(event));
  return event;
}

function expectComposerFocus() {
  act(() => {
    vi.advanceTimersByTime(16);
  });
  expect(document.activeElement).toBe(composer);
}

function resetAgentBlock() {
  harness.agent.isWorking = false;
  harness.agent.queuedPrompt = null;
  harness.agent.conversationLoadPendingId = null;
  harness.agent.historyMutationPending = false;
  harness.agent.usage = null;
}

function setAgentBlock(reason: string) {
  if (reason === "working") harness.agent.isWorking = true;
  if (reason === "queued") harness.agent.queuedPrompt = "Another queued request";
  if (reason === "loading conversation") harness.agent.conversationLoadPendingId = "loading-conversation";
  if (reason === "history mutation") harness.agent.historyMutationPending = true;
  if (reason === "usage blocked") harness.agent.usage = { blockedReason: "credits_exhausted" };
}

function openRequest(id: string) {
  click(id);
  click(`${id}-ask-ai`);
  finishClose(id);
}

function typeRequest(value: string) {
  const input = host.querySelector<HTMLTextAreaElement>("#view-ai-request-input");
  if (!input) throw new Error("Missing request input");
  act(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
    descriptor?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function submitRequest() {
  const form = host.querySelector<HTMLFormElement>("#view-ai-request-form");
  if (!form) throw new Error("Missing request form");
  act(() => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

function finishRequestClose(): Event {
  const callback = harness.request.onCloseAutoFocus;
  if (!callback) throw new Error("Missing request close callback");
  const event = new Event("closeAutoFocus", { cancelable: true });
  act(() => callback(event));
  return event;
}

beforeEach(() => {
  harness.locale = null;
  harness.pathname = "/en/contacts";
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 16));
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.agent.enabled = true;
  resetAgentBlock();
  harness.request = { onCloseAutoFocus: undefined, focusReturnTarget: null };
  harness.sentRoutes.length = 0;
  harness.agent.sendMessage.mockReset().mockImplementation((_text, options) => {
    harness.sentRoutes.push(options?.pageRoute ?? harness.agent.viewContext.route(PATHNAME));
    return Promise.resolve();
  });
  harness.agent.composerDraft = "";
  harness.agent.viewContext = new AgentViewContext();
  harness.agent.openWithDraft.mockReset().mockImplementation((draft) => {
    harness.agent.composerDraft = draft;
  });
  harness.overlays.clear();
  harness.palette = new FilterPaletteStore({
    registerModalStore: vi.fn(),
    localeStore: { getTranslation: (key: string) => key },
  } as unknown as RootStore);
  host = document.createElement("div");
  composer = document.createElement("textarea");
  composer.id = "agent-composer";
  document.body.append(host, composer);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host.remove();
  composer.remove();
  root = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("view menu AI request", () => {
  it("edits Contacts All from Appearance even when the requested filter mentions deals", () => {
    harness.locale = "en";
    const store = dataViewStore({ activeViewKey: ALL_VIEW_KEY });
    render(createElement(DataViewDisplayOptions, { id: "appearance", store }));
    openRequest("appearance");
    expect(host.textContent).toContain("Contacts · View: All");
    typeRequest("Change this to Kanban and show contacts with at least one linked deal.");
    submitRequest();
    finishRequestClose();
    expect(harness.agent.sendMessage).toHaveBeenCalledExactlyOnceWith(
      "Context: Contacts.\nUpdate the appearance of my current view “All”. Keep any settings I do not mention.\n\nChange this to Kanban and show contacts with at least one linked deal.",
      { pageRoute: "/en/contacts?view=__all__&viewSurface=contacts-card-store&viewAction=update" },
    );
  });

  it.each(APP_LOCALES)("sends readable %s timeline instructions with the exact record and current view", (locale) => {
    harness.locale = locale;
    harness.pathname = `/${locale}/contacts/00000000-0000-4000-8000-000000000001`;
    const store = dataViewStore({ p13nId: SURFACE.entityTimeline, activeViewKey: ALL_VIEW_KEY });
    render(createElement(FilterPopover, { id: "filters", store }));
    openRequest("filters");
    const copy = catalogs[locale].DataView.views;
    expect(host.textContent).toContain(copy.aiRequest.timelineLocation);
    expect(host.querySelector('label[for="view-ai-request-input"]')?.textContent).toBe(copy.aiRequest.timelineLabel);
    typeRequest("Only show record creation events.");
    submitRequest();
    finishRequestClose();
    expect(harness.agent.sendMessage).toHaveBeenCalledExactlyOnceWith(
      `${copy.aiRequest.contextPrompt.replace("{location}", copy.aiRequest.timelineLocation)}\n${copy.aiRequest.filtersPrompt.replace("{name}", copy.all)}\n\nOnly show record creation events.`,
      { pageRoute: `${harness.pathname}?view=__all__&viewSurface=entity-timeline&viewAction=update` },
    );
    expect(harness.agent.sendMessage.mock.calls[0]?.[0]).not.toMatch(/DataView\.|entity-timeline|00000000|this page/);
  });

  it("does not send an open timeline request after changing records", () => {
    harness.pathname = "/en/contacts/00000000-0000-4000-8000-000000000001";
    const store = dataViewStore({ p13nId: SURFACE.entityTimeline });
    render(createElement(FilterPopover, { id: "filters", store }));
    openRequest("filters");
    typeRequest("Only show messages.");
    harness.pathname = "/en/contacts/00000000-0000-4000-8000-000000000002";
    render(createElement(FilterPopover, { id: "filters", store }));
    submitRequest();
    finishRequestClose();
    expect(host.textContent).toContain("DataView.views.aiRequest.contextChanged");
    expect(harness.agent.sendMessage).not.toHaveBeenCalled();
  });

  it("flushes a pending palette draft, asks for instructions, then sends once after the request dialog closes", async () => {
    const store = dataViewStore();
    render(createElement(FilterPopover, { id: "filters", store }));
    click("filters");
    expect(host.querySelectorAll("header #filters-ask-ai")).toHaveLength(1);
    expect(host.querySelector("footer #filters-ask-ai")).toBeNull();
    act(() => {
      harness.palette.pickField("name");
      harness.palette.onChange("draft.value", "Leon");
    });
    expect(store.setQueryOptions).not.toHaveBeenCalled();
    click("filters-ask-ai");
    expect(store.setQueryOptions).toHaveBeenCalledExactlyOnceWith({
      filters: [{ field: "name", operator: FilterOperatorKey.contains, value: "Leon" }],
      refreshMode: "background",
    });
    expect(harness.palette.isOpen).toBe(false);
    expect(host.querySelector("#view-ai-request-input")).toBeNull();
    expect(finishClose("filters").defaultPrevented).toBe(true);
    expect(host.querySelector('label[for="view-ai-request-input"]')?.textContent).toBe(
      "DataView.views.aiRequest.filtersLabel",
    );
    expect(harness.request.focusReturnTarget).toBe(host.querySelector("#filters"));
    expect(harness.agent.openWithDraft).not.toHaveBeenCalled();
    expect(harness.agent.sendMessage).not.toHaveBeenCalled();
    expect(harness.agent.viewContext.route(PATHNAME)).toBe(PATHNAME);
    expect(document.activeElement).toBe(host.querySelector("#view-ai-request-input"));

    typeRequest("  Only show Leon and keep my current layout.  ");
    submitRequest();
    expect(host.querySelector("#view-ai-request-input")).toBeNull();
    expect(harness.agent.sendMessage).not.toHaveBeenCalled();
    expect(finishRequestClose().defaultPrevented).toBe(true);
    expect(harness.agent.openWithDraft).toHaveBeenCalledExactlyOnceWith("");
    expect(harness.agent.sendMessage).toHaveBeenCalledExactlyOnceWith(
      "DataView.views.aiRequest.contextPrompt(contacts)\nDataView.views.aiRequest.filtersPrompt(Qualified contacts)\n\nOnly show Leon and keep my current layout.",
      { pageRoute: `${PATHNAME}?view=${VIEW_ID}&viewSurface=${SURFACE.contacts}&viewAction=update` },
    );
    expect(harness.sentRoutes).toEqual([
      `${PATHNAME}?view=${VIEW_ID}&viewSurface=${SURFACE.contacts}&viewAction=update`,
    ]);
    await harness.agent.viewContext.prepare(harness.agent.viewContext.route(PATHNAME));
    expect(store.settleViewState).toHaveBeenCalledOnce();
    expectComposerFocus();
    act(() => {
      vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS);
    });
    expect(store.setQueryOptions).toHaveBeenCalledOnce();
    expect(finishRequestClose().defaultPrevented).toBe(false);
    expect(harness.agent.sendMessage).toHaveBeenCalledOnce();
  });

  it("sends appearance instructions without sending or overwriting a separate composer draft", () => {
    const store = dataViewStore();
    harness.agent.composerDraft = "Keep my unrelated unfinished message.";
    render(createElement(DataViewDisplayOptions, { id: "appearance", store }));
    openRequest("appearance");
    expect(host.querySelector('label[for="view-ai-request-input"]')?.textContent).toBe(
      "DataView.views.aiRequest.appearanceLabel",
    );
    expect(harness.request.focusReturnTarget).toBe(host.querySelector("#appearance"));
    expect(harness.agent.openWithDraft).not.toHaveBeenCalled();
    expect(harness.agent.sendMessage).not.toHaveBeenCalled();
    typeRequest("Hide phones and use board layout.");
    submitRequest();
    expect(harness.agent.sendMessage).not.toHaveBeenCalled();
    finishRequestClose();
    expect(harness.agent.openWithDraft).toHaveBeenCalledExactlyOnceWith("Keep my unrelated unfinished message.");
    expect(harness.agent.composerDraft).toBe("Keep my unrelated unfinished message.");
    expect(harness.agent.sendMessage).toHaveBeenCalledExactlyOnceWith(
      "DataView.views.aiRequest.contextPrompt(contacts)\nDataView.views.aiRequest.appearancePrompt(Qualified contacts)\n\nHide phones and use board layout.",
      { pageRoute: `${PATHNAME}?view=${VIEW_ID}&viewSurface=${SURFACE.contacts}&viewAction=update` },
    );
    expectComposerFocus();
  });

  it.each(["filters", "appearance"])("does not send or claim context when the %s request is cancelled", (id) => {
    const store = dataViewStore();
    harness.agent.composerDraft = "Unsent draft";
    render(
      id === "filters"
        ? createElement(FilterPopover, { id, store })
        : createElement(DataViewDisplayOptions, { id, store }),
    );
    openRequest(id);
    typeRequest("Do not send this cancelled request.");
    click("view-ai-request-cancel");
    expect(finishRequestClose().defaultPrevented).toBe(false);
    expect(host.querySelector("#view-ai-request-input")).toBeNull();
    expect(harness.agent.openWithDraft).not.toHaveBeenCalled();
    expect(harness.agent.sendMessage).not.toHaveBeenCalled();
    expect(harness.agent.composerDraft).toBe("Unsent draft");
    expect(harness.agent.viewContext.route(PATHNAME)).toBe(PATHNAME);
  });

  it("leaves normal cancellation focus alone in both menus", () => {
    const store = dataViewStore();
    render(
      createElement(
        Fragment,
        null,
        createElement(FilterPopover, { id: "filters", store }),
        createElement(DataViewDisplayOptions, { id: "appearance", store }),
      ),
    );
    for (const id of ["filters", "appearance"]) {
      click(id);
      act(() => harness.overlays.get(id)?.onOpenChange(false));
      expect(finishClose(id).defaultPrevented).toBe(false);
    }
    expect(harness.agent.openWithDraft).not.toHaveBeenCalled();
    expect(harness.agent.sendMessage).not.toHaveBeenCalled();
    expect(harness.agent.viewContext.route(PATHNAME)).toBe(PATHNAME);
  });

  it("requires nonblank instructions even for a directly dispatched form submit", () => {
    render(createElement(DataViewDisplayOptions, { id: "appearance", store: dataViewStore() }));
    openRequest("appearance");
    typeRequest("   \n  ");
    expect(host.querySelector<HTMLButtonElement>("#view-ai-request-submit")?.disabled).toBe(true);
    submitRequest();
    expect(host.querySelector("#view-ai-request-input")).not.toBeNull();
    expect(finishRequestClose().defaultPrevented).toBe(false);
    expect(harness.agent.sendMessage).not.toHaveBeenCalled();
  });

  it.each(["working", "queued", "loading conversation", "history mutation", "usage blocked"])(
    "retains the request and explains why submission is disabled while %s",
    (reason) => {
      setAgentBlock(reason);
      render(createElement(DataViewDisplayOptions, { id: "appearance", store: dataViewStore() }));
      openRequest("appearance");
      typeRequest("Keep these instructions until chat is available.");
      expect(host.querySelector<HTMLButtonElement>("#view-ai-request-submit")?.disabled).toBe(true);
      expect(host.querySelector("#view-ai-request-status")?.textContent).toBe(
        reason === "usage blocked" ? "DataView.views.aiRequest.unavailable" : "DataView.views.aiRequest.busy",
      );
      submitRequest();
      expect(host.querySelector<HTMLTextAreaElement>("#view-ai-request-input")?.value).toBe(
        "Keep these instructions until chat is available.",
      );
      expect(harness.agent.sendMessage).not.toHaveBeenCalled();
    },
  );

  it.each(["working", "queued", "loading conversation", "history mutation", "usage blocked"])(
    "rechecks a late %s state at close and reopens the request without losing its text",
    (reason) => {
      render(createElement(DataViewDisplayOptions, { id: "appearance", store: dataViewStore() }));
      openRequest("appearance");
      typeRequest("Preserve me across the late busy state.");
      submitRequest();
      expect(host.querySelector("#view-ai-request-input")).toBeNull();
      setAgentBlock(reason);
      expect(finishRequestClose().defaultPrevented).toBe(true);
      expect(host.querySelector<HTMLTextAreaElement>("#view-ai-request-input")?.value).toBe(
        "Preserve me across the late busy state.",
      );
      expect(harness.agent.openWithDraft).not.toHaveBeenCalled();
      expect(harness.agent.sendMessage).not.toHaveBeenCalled();
      expect(harness.agent.viewContext.route(PATHNAME)).toBe(PATHNAME);
      resetAgentBlock();
      typeRequest("Preserve me across the late busy state. Retry now.");
      submitRequest();
      finishRequestClose();
      expect(harness.agent.sendMessage).toHaveBeenCalledExactlyOnceWith(
        "DataView.views.aiRequest.contextPrompt(contacts)\nDataView.views.aiRequest.appearancePrompt(Qualified contacts)\n\nPreserve me across the late busy state. Retry now.",
        { pageRoute: `${PATHNAME}?view=${VIEW_ID}&viewSurface=${SURFACE.contacts}&viewAction=update` },
      );
    },
  );

  it.each(["view", "surface"])(
    "refuses a late changed %s target instead of applying instructions elsewhere",
    (changed) => {
      const store = dataViewStore();
      render(createElement(DataViewDisplayOptions, { id: "appearance", store }));
      openRequest("appearance");
      typeRequest("Change only the view I chose.");
      submitRequest();
      if (changed === "view") store.activeViewKey = ALL_VIEW_KEY;
      else store.p13nId = SURFACE.entityTimeline;
      finishRequestClose();
      expect(host.querySelector<HTMLTextAreaElement>("#view-ai-request-input")?.value).toBe(
        "Change only the view I chose.",
      );
      expect(host.querySelector("#view-ai-request-status")?.textContent).toBe(
        "DataView.views.aiRequest.contextChanged",
      );
      expect(harness.agent.sendMessage).not.toHaveBeenCalled();
      expect(harness.agent.viewContext.route(PATHNAME)).toBe(PATHNAME);
    },
  );

  it("does not send a deferred request after its view owner unmounts", () => {
    render(createElement(DataViewDisplayOptions, { id: "appearance", store: dataViewStore() }));
    openRequest("appearance");
    typeRequest("Do not send after navigation.");
    submitRequest();
    const onCloseAutoFocus = harness.request.onCloseAutoFocus;
    render(null);
    act(() => onCloseAutoFocus?.(new Event("closeAutoFocus", { cancelable: true })));
    expect(harness.agent.sendMessage).not.toHaveBeenCalled();
    expect(harness.agent.viewContext.route(PATHNAME)).toBe(PATHNAME);
  });

  it.each(["disabled chat", "unready view", "no saved-view surface"])("offers neither AI action for %s", (reason) => {
    harness.agent.enabled = reason !== "disabled chat";
    const store = dataViewStore({
      isReady: reason !== "unready view",
      p13nId: reason === "no saved-view surface" ? undefined : SURFACE.contacts,
    });
    render(
      createElement(
        Fragment,
        null,
        createElement(FilterPopover, { id: "filters", store }),
        createElement(DataViewDisplayOptions, { id: "appearance", store }),
      ),
    );
    click("filters");
    click("appearance");
    expect(host.querySelector("#filters-ask-ai")).toBeNull();
    expect(host.querySelector("#appearance-ask-ai")).toBeNull();
    expect(harness.agent.viewContext.route(PATHNAME)).toBe(PATHNAME);
  });

  it("keeps passive menus from claiming context, follows the sent owner live, and restores the page owner on unmount", async () => {
    const page = dataViewStore();
    const timeline = dataViewStore({ p13nId: SURFACE.entityTimeline, activeViewKey: ALL_VIEW_KEY });
    const context = harness.agent.viewContext;
    const releasePage = context.register(
      PATHNAME,
      () => ({ surfaceKey: SURFACE.contacts, viewKey: VIEW_ID }),
      () => page.settleViewState(),
    );
    const pageRoute = context.route(PATHNAME);
    const filter = createElement(FilterPopover, { id: "filters", key: "filters", store: page });
    const appearance = createElement(DataViewDisplayOptions, { id: "appearance", key: "appearance", store: timeline });
    render(createElement(Fragment, null, filter, appearance));
    expect(context.route(PATHNAME)).toBe(pageRoute);
    openRequest("appearance");
    expect(context.route(PATHNAME)).toBe(pageRoute);
    expect(host.querySelector('label[for="view-ai-request-input"]')?.textContent).toBe(
      "DataView.views.aiRequest.timelineLabel",
    );
    typeRequest("Create a recent activity view.");
    submitRequest();
    finishRequestClose();
    expect(harness.sentRoutes).toEqual([
      `${PATHNAME}?view=__all__&viewSurface=${SURFACE.entityTimeline}&viewAction=update`,
    ]);
    await context.prepare(context.route(PATHNAME));
    expect(timeline.settleViewState).toHaveBeenCalledOnce();
    expect(page.settleViewState).not.toHaveBeenCalled();
    timeline.activeViewKey = VIEW_ID;
    expect(context.route(PATHNAME)).toContain(`view=${VIEW_ID}&viewSurface=${SURFACE.entityTimeline}`);
    render(createElement(Fragment, null, filter));
    expect(context.route(PATHNAME)).toBe(pageRoute);
    await context.prepare(pageRoute);
    expect(page.settleViewState).toHaveBeenCalledOnce();
    releasePage();
    expect(context.route(PATHNAME)).toBe(PATHNAME);
  });
});
