import type { ReactNode } from "react";
import type * as NextIntl from "next-intl";
import type { Root as ReactRoot } from "react-dom/client";
import type { AgentContextCandidate } from "@/app/components/agent-chat/agent-context-registry";
import type { AgentViewContext as ViewContext } from "@/app/components/agent-chat/agent-view-context";
import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import type { Filter } from "@/core/base/base-get.schema";
import type { RootStore } from "@/core/stores/root.store";
import type { AgentContextAttachment } from "@/ee/agent-chat/agent-context";
import type { FilterPaletteStore as PaletteStore } from "@/components/data-view/filter-palette/filter-palette.store";

import { act, createElement, Fragment } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";
import { ALL_VIEW_KEY, SURFACE } from "@/core/data-view/data-view-keys";
import { APP_LOCALES, type AppLocale } from "@/i18n/locale-registry";
import de from "@/i18n/locales/de.json";
import en from "@/i18n/locales/en.json";
import es from "@/i18n/locales/es.json";
import fr from "@/i18n/locales/fr.json";
import itMessages from "@/i18n/locales/it.json";

const catalogs = { de, en, es, fr, it: itMessages };

type ContextDraftInput = {
  context: AgentContextAttachment;
  draft: string;
  pageRoute: string;
};

const harness = vi.hoisted(() => ({
  locale: null as AppLocale | null,
  pathname: "/en/contacts",
  agent: {
    enabled: true,
    composerContexts: [] as AgentContextAttachment[],
    composerDraft: "",
    contextRegistry: {
      candidates: vi.fn<(pathname: string) => AgentContextCandidate[]>(),
      register: vi.fn(() => vi.fn()),
    },
    addComposerContext: vi.fn<(context: AgentContextAttachment, pageRoute?: string) => void>(),
    openWithContextDraft: vi.fn<(input: ContextDraftInput) => void>(),
    sendMessage: vi.fn(),
    viewContext: null as unknown as ViewContext,
  },
  overlays: new Map<
    string,
    {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      onCloseAutoFocus?: (event: Event) => void;
    }
  >(),
  palette: null as unknown as PaletteStore,
}));

vi.mock("next/navigation", () => ({ usePathname: () => harness.pathname }));
vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof NextIntl>();
  return {
    ...actual,
    useTranslations: () =>
      harness.locale
        ? actual.createTranslator({
            locale: harness.locale,
            messages: catalogs[harness.locale],
          })
        : (key: string, values?: Record<string, unknown>) =>
            values ? `${key}(${Object.values(values).join(",")})` : key,
  };
});
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    agentChatStore: harness.agent,
    filterPaletteStore: harness.palette,
  }),
}));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({
    plural: (entity: string) =>
      harness.locale ? catalogs[harness.locale].EntityTerminology.presets.contact.contact.plural : `${entity}s`,
  }),
}));
vi.mock("@/components/entity-terminology/use-column-label", () => ({
  useColumnLabel: () => (uid: string) => uid,
}));
vi.mock("@/components/entity-terminology/use-filter-field-label", () => ({
  useFilterFieldLabel: () => (field: string) => field,
}));
vi.mock("@/components/data-view/filter-palette/filter-palette", () => ({
  FilterPalette: () => null,
}));
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

import { AgentViewContext } from "@/app/components/agent-chat/agent-view-context";
import {
  FILTER_AUTO_APPLY_DELAY_MS,
  FilterPaletteStore,
} from "@/components/data-view/filter-palette/filter-palette.store";
import { DataViewDisplayOptions } from "@/components/data-view/header/display-options";
import { FilterPopover } from "@/components/data-view/header/filter-popover";

const VIEW_ID = "b6319ec8-d1b5-4844-bba4-c8c0ca819214";
const RECORD_ID = "00000000-0000-4000-8000-000000000001";
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

function interpolate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce((result, [key, value]) => result.replace(`{${key}}`, value), template);
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

function openAi(id: string): Event {
  click(id);
  click(`${id}-ask-ai`);
  return finishClose(id);
}

function expectComposerFocus() {
  act(() => {
    vi.advanceTimersByTime(16);
  });
  expect(document.activeElement).toBe(composer);
}

beforeEach(() => {
  harness.locale = null;
  harness.pathname = PATHNAME;
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(0), 16));
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.agent.enabled = true;
  harness.agent.composerContexts = [];
  harness.agent.composerDraft = "";
  harness.agent.contextRegistry.candidates.mockReset().mockReturnValue([]);
  harness.agent.contextRegistry.register.mockClear();
  harness.agent.addComposerContext.mockReset().mockImplementation((context) => {
    harness.agent.composerContexts.push(context);
  });
  harness.agent.openWithContextDraft.mockReset().mockImplementation(({ context, draft }) => {
    harness.agent.composerContexts = [context];
    if (!harness.agent.composerDraft.trim()) harness.agent.composerDraft = draft;
  });
  harness.agent.sendMessage.mockReset();
  harness.agent.viewContext = new AgentViewContext();
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

describe("view menu AI context handoff", () => {
  it("opens the composer with the exact Contacts All appearance context without sending", () => {
    harness.locale = "en";
    const store = dataViewStore({ activeViewKey: ALL_VIEW_KEY });
    render(createElement(DataViewDisplayOptions, { id: "appearance", store }));

    const closeEvent = openAi("appearance");

    expect(closeEvent.defaultPrevented).toBe(true);
    expect(harness.agent.openWithContextDraft).toHaveBeenCalledExactlyOnceWith({
      context: {
        label: "View: All",
        reference: {
          kind: "dataView",
          requestedAction: "update",
          surfaceKey: SURFACE.contacts,
          viewKey: ALL_VIEW_KEY,
        },
      },
      draft: "Change the layout, grouping, sorting, or columns for this view as follows: ",
      pageRoute: `${PATHNAME}?view=${ALL_VIEW_KEY}&viewSurface=${SURFACE.contacts}&viewAction=update`,
    });
    expect(harness.agent.sendMessage).not.toHaveBeenCalled();
    expect(harness.agent.composerContexts).toEqual([
      expect.objectContaining({
        reference: expect.objectContaining({ surfaceKey: SURFACE.contacts }),
      }),
    ]);
    expectComposerFocus();
  });

  it.each(APP_LOCALES)(
    "opens the %s timeline composer with localized view context and the current record attached",
    (locale) => {
      harness.locale = locale;
      harness.pathname = `/${locale}/contacts/${RECORD_ID}`;
      const copy = catalogs[locale];
      const record: AgentContextCandidate = {
        context: {
          label: "Julian Wagner",
          reference: {
            entityType: "contact",
            kind: "record",
            recordId: RECORD_ID,
          },
        },
        pageRoute: harness.pathname,
      };
      harness.agent.contextRegistry.candidates.mockReturnValue([record]);
      const store = dataViewStore({
        activeViewKey: ALL_VIEW_KEY,
        p13nId: SURFACE.entityTimeline,
      });
      render(createElement(FilterPopover, { id: "filters", store }));

      const closeEvent = openAi("filters");

      const pageRoute = `${harness.pathname}?view=${ALL_VIEW_KEY}&viewSurface=${SURFACE.entityTimeline}&viewAction=update`;
      expect(closeEvent.defaultPrevented).toBe(true);
      expect(harness.agent.openWithContextDraft).toHaveBeenCalledExactlyOnceWith({
        context: {
          label: interpolate(copy.AgentChat.context.viewLabel, {
            name: copy.DataView.views.all,
          }),
          reference: {
            kind: "dataView",
            requestedAction: "update",
            surfaceKey: SURFACE.entityTimeline,
            viewKey: ALL_VIEW_KEY,
          },
        },
        draft: copy.AgentChat.context.starter.timeline,
        pageRoute,
      });
      expect(harness.agent.contextRegistry.candidates).toHaveBeenCalledWith(harness.pathname);
      expect(harness.agent.addComposerContext).toHaveBeenCalledExactlyOnceWith(
        record.context,
        record.pageRoute,
        undefined,
        { replaceOldestAtLimit: true },
      );
      expect(harness.agent.composerContexts).toEqual([
        expect.objectContaining({
          reference: expect.objectContaining({ kind: "dataView" }),
        }),
        record.context,
      ]);
      expect(harness.agent.sendMessage).not.toHaveBeenCalled();
    },
  );

  it("flushes a pending filter draft before handing the exact filter context to the composer", async () => {
    const store = dataViewStore();
    render(createElement(FilterPopover, { id: "filters", store }));
    click("filters");
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
    expect(harness.agent.openWithContextDraft).not.toHaveBeenCalled();

    const closeEvent = finishClose("filters");
    const pageRoute = `${PATHNAME}?view=${VIEW_ID}&viewSurface=${SURFACE.contacts}&viewAction=update`;
    expect(closeEvent.defaultPrevented).toBe(true);
    expect(harness.agent.openWithContextDraft).toHaveBeenCalledExactlyOnceWith({
      context: {
        label: "AgentChat.context.viewLabel(Qualified contacts)",
        reference: {
          kind: "dataView",
          requestedAction: "update",
          surfaceKey: SURFACE.contacts,
          viewKey: VIEW_ID,
        },
      },
      draft: "AgentChat.context.starter.filters(Qualified contacts)",
      pageRoute,
    });
    expect(harness.agent.sendMessage).not.toHaveBeenCalled();
    expect(harness.agent.viewContext.route(PATHNAME)).toBe(
      `${PATHNAME}?view=${VIEW_ID}&viewSurface=${SURFACE.contacts}`,
    );
    await harness.agent.viewContext.prepare(pageRoute);
    expect(store.settleViewState).toHaveBeenCalledOnce();
    expectComposerFocus();

    act(() => {
      vi.advanceTimersByTime(FILTER_AUTO_APPLY_DELAY_MS);
    });
    expect(store.setQueryOptions).toHaveBeenCalledOnce();
  });

  it("attaches appearance context without replacing an unrelated composer draft", () => {
    const store = dataViewStore();
    harness.agent.composerDraft = "Keep my unrelated unfinished message.";
    render(createElement(DataViewDisplayOptions, { id: "appearance", store }));

    openAi("appearance");

    expect(harness.agent.openWithContextDraft).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        context: expect.objectContaining({
          reference: expect.objectContaining({
            kind: "dataView",
            surfaceKey: SURFACE.contacts,
            viewKey: VIEW_ID,
          }),
        }),
        draft: "AgentChat.context.starter.appearance(Qualified contacts)",
      }),
    );
    expect(harness.agent.composerDraft).toBe("Keep my unrelated unfinished message.");
    expect(harness.agent.sendMessage).not.toHaveBeenCalled();
    expectComposerFocus();
  });

  it("leaves ordinary menu closes alone and does not attach context", () => {
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

    expect(harness.agent.openWithContextDraft).not.toHaveBeenCalled();
    expect(harness.agent.addComposerContext).not.toHaveBeenCalled();
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
    expect(harness.agent.openWithContextDraft).not.toHaveBeenCalled();
    expect(harness.agent.viewContext.route(PATHNAME)).toBe(PATHNAME);
  });

  it("claims context only after handoff, prepares the selected owner, and restores the page owner on unmount", async () => {
    const page = dataViewStore();
    const timeline = dataViewStore({
      activeViewKey: ALL_VIEW_KEY,
      p13nId: SURFACE.entityTimeline,
    });
    const context = harness.agent.viewContext;
    const releasePage = context.register(
      PATHNAME,
      () => ({ surfaceKey: SURFACE.contacts, viewKey: VIEW_ID }),
      () => page.settleViewState(),
    );
    const pageRoute = context.route(PATHNAME);
    render(
      createElement(DataViewDisplayOptions, {
        id: "appearance",
        store: timeline,
      }),
    );

    expect(context.route(PATHNAME)).toBe(pageRoute);
    click("appearance");
    click("appearance-ask-ai");
    expect(context.route(PATHNAME)).toBe(pageRoute);

    const closeEvent = finishClose("appearance");
    const timelineRoute = `${PATHNAME}?view=${ALL_VIEW_KEY}&viewSurface=${SURFACE.entityTimeline}&viewAction=update`;
    expect(closeEvent.defaultPrevented).toBe(true);
    expect(context.route(PATHNAME)).toBe(`${PATHNAME}?view=${ALL_VIEW_KEY}&viewSurface=${SURFACE.entityTimeline}`);
    expect(harness.agent.openWithContextDraft).toHaveBeenCalledWith(
      expect.objectContaining({ pageRoute: timelineRoute }),
    );
    await context.prepare(timelineRoute);
    expect(timeline.settleViewState).toHaveBeenCalledOnce();
    expect(page.settleViewState).not.toHaveBeenCalled();

    render(null);
    expect(context.route(PATHNAME)).toBe(pageRoute);
    await context.prepare(pageRoute);
    expect(page.settleViewState).toHaveBeenCalledOnce();
    releasePage();
    expect(context.route(PATHNAME)).toBe(PATHNAME);
  });
});
