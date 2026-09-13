import type { ReactNode } from "react";
import type { Root as ReactRoot } from "react-dom/client";
import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";

const harness = vi.hoisted(() => ({
  agent: {
    enabled: true,
    composerDraft: "",
    open: vi.fn(),
    openWithDraft: vi.fn<(draft: string) => void>(),
    sendMessage: vi.fn<(text: string) => Promise<void>>(),
    viewContext: { register: vi.fn(() => vi.fn()) },
  },
  appMode: { current: "cloud" as "cloud" | "demo" | "self-hosted" },
  calls: [] as string[],
  confirmations: [] as { entityName?: string; onConfirm: () => Promise<boolean> }[],
  deleteDataViewAction: vi.fn(),
  menuOpen: false,
  menuCloseAutoFocus: { current: undefined as ((event: Event) => void) | undefined },
  overlayCloseAutoFocus: { current: undefined as ((event: Event) => void) | undefined },
  requestCloseAutoFocus: { current: undefined as ((event: Event) => void) | undefined },
  routerPush: vi.fn(),
  searchParams: { current: "" },
  upsertDataViewAction: vi.fn(),
}));

vi.mock("mobx-react-lite", () => ({ observer: <T>(component: T) => component }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/en/deals",
  useSearchParams: () => new URLSearchParams(harness.searchParams.current),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: harness.routerPush }),
  usePathname: () => "/deals",
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${Object.values(values).join(",")})` : key,
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ appMode: harness.appMode.current, agentChatStore: harness.agent }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/actions", () => ({
  deleteDataViewAction: (...args: unknown[]) => {
    harness.calls.push("deleteDataViewAction");
    return harness.deleteDataViewAction(...args);
  },
  upsertDataViewAction: (...args: unknown[]) => {
    harness.calls.push("upsertDataViewAction");
    return harness.upsertDataViewAction(...args);
  },
}));
vi.mock("@/components/modal/hooks/use-delete-confirmation", () => ({
  useDeleteConfirmation: () => ({
    showDeleteConfirmation: (onConfirm: () => Promise<boolean>, entityName?: string) =>
      harness.confirmations.push({ entityName, onConfirm }),
  }),
}));
vi.mock("@/components/modal/responsive-overlay", () => ({
  ResponsiveOverlay: ({
    children,
    footer,
    open,
    trigger,
    onOpenChange,
    onCloseAutoFocus,
  }: {
    children: ReactNode;
    footer?: ReactNode;
    open: boolean;
    trigger: ReactNode;
    onOpenChange: (open: boolean) => void;
    onCloseAutoFocus?: (event: Event) => void;
  }) => {
    harness.overlayCloseAutoFocus.current = onCloseAutoFocus;
    return createElement(
      "div",
      null,
      createElement("span", { onClick: () => onOpenChange(!open) }, trigger),
      open ? children : null,
      open ? footer : null,
    );
  },
}));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children, open }: { children: ReactNode; open: boolean }) => {
    harness.menuOpen = open;
    return createElement("div", null, children);
  },
  DropdownMenuContent: ({
    children,
    onCloseAutoFocus,
  }: {
    children: ReactNode;
    onCloseAutoFocus?: (event: Event) => void;
  }) => {
    harness.menuCloseAutoFocus.current = onCloseAutoFocus;

    return createElement("div", { "data-view-menu": "" }, children);
  },
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect,
    ...props
  }: {
    children: ReactNode;
    disabled?: boolean;
    onSelect: () => void;
    id?: string;
    "aria-label"?: string;
  }) => createElement("button", { ...props, disabled, onClick: onSelect, type: "button" }, children),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/modal/app-modal", () => ({
  AppModal: ({
    children,
    open,
    onCloseAutoFocus,
  }: {
    children: ReactNode;
    open: boolean;
    onCloseAutoFocus?: (event: Event) => void;
  }) => {
    harness.requestCloseAutoFocus.current = onCloseAutoFocus;
    return open ? createElement("section", { "data-request-dialog": "" }, children) : null;
  },
}));

vi.mock("@/app/components/agent-chat/chat-ui", () => ({ focusAgentComposer: vi.fn() }));

import { DataViewViewsRail } from "../views/data-view-views-rail";
import { focusAgentComposer } from "@/app/components/agent-chat/chat-ui";

type Item = { id: string };

function view(overrides: Partial<DataViewChipDto> & { id: string }): DataViewChipDto {
  return {
    name: `View ${overrides.id}`,
    position: 0,
    state: {},
    ...overrides,
  };
}

const ADA = view({ id: "v-a", name: "Ada", position: 0 });
const OPEN = view({ id: "v-b", name: "Open deals", position: 1 });
const CLOSING = view({ id: "v-c", name: "Closing", position: 2, state: { hiddenColumns: ["email"] } });
const VIEWS = [ADA, OPEN, CLOSING];

function store(overrides: Partial<BaseDataViewStore<Item>> = {}): BaseDataViewStore<Item> {
  return {
    activeViewKey: ALL_VIEW_KEY,
    applyView: vi.fn(() => harness.calls.push("applyView")),
    discardPendingViewState: vi.fn(() => harness.calls.push("discardPendingViewState")),
    columnOrder: [],
    columnWidths: {},
    entityType: "DEAL",
    filters: [],
    grouping: null,
    hasSelection: false,
    hiddenColumns: [],
    isDisabled: false,
    isReady: true,
    p13nId: "deals-card-store",
    pagination: { page: 1, pageSize: 25, total: 42 },
    refresh: vi.fn(() => {
      harness.calls.push("refresh");
      return Promise.resolve();
    }),
    searchTerm: "",
    sortDescriptor: undefined,
    viewMode: "table",
    views: VIEWS,
    ...overrides,
  } as unknown as BaseDataViewStore<Item>;
}

let root: ReactRoot | undefined;
let container: HTMLDivElement | undefined;

function render(value: BaseDataViewStore<Item>, detailParam?: string): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(DataViewViewsRail<Item>, { detailParam, store: value } as {
        detailParam?: string;
        store: BaseDataViewStore<Item>;
      }) as ReactNode,
    );
  });
  return container;
}

function chips(host: HTMLElement): HTMLAnchorElement[] {
  return [...host.querySelectorAll<HTMLAnchorElement>("a[data-view-chip]")];
}

function menuLabels(host: HTMLElement): string[] {
  return [...host.querySelectorAll<HTMLButtonElement>("[data-view-menu] button")].map(
    (button) => button.textContent?.trim() ?? "",
  );
}

function byText(host: HTMLElement, text: string): HTMLButtonElement {
  const found = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === text,
  );
  if (!found) throw new Error(`no button labelled ${text}`);
  return found;
}

// eslint-disable-next-line @typescript-eslint/unbound-method -- the prototype setter must bypass React's value tracker so the controlled input sees the change
const setNativeInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set as
  | ((this: HTMLInputElement, value: string) => void)
  | undefined;

function typeInto(input: HTMLInputElement | null, value: string): void {
  act(() => {
    if (input) setNativeInputValue?.call(input, value);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submitMetaForm(host: HTMLElement): Promise<void> {
  await act(async () => {
    host
      .querySelector<HTMLFormElement>("#view-editor-form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

function typeRequest(host: HTMLElement, value: string): void {
  const input = host.querySelector<HTMLTextAreaElement>("#view-ai-request-input");
  if (!input) throw new Error("Missing request input");
  act(() => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
    descriptor?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function submitRequest(host: HTMLElement): void {
  const form = host.querySelector<HTMLFormElement>("#view-ai-request-form");
  if (!form) throw new Error("Missing request form");
  act(() => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

function finishRequestClose(): Event {
  const callback = harness.requestCloseAutoFocus.current;
  if (!callback) throw new Error("Missing request close callback");
  const event = new Event("closeAutoFocus", { cancelable: true });
  act(() => callback(event));
  return event;
}

function press(target: HTMLElement, key: string): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }));
  });
}

function swallowNavigation(event: Event): void {
  event.preventDefault();
}

beforeEach(() => {
  harness.agent.enabled = true;
  harness.agent.composerDraft = "";
  harness.agent.open.mockReset();
  harness.agent.openWithDraft.mockReset().mockImplementation((draft) => {
    harness.agent.composerDraft = draft;
  });
  harness.agent.sendMessage.mockReset().mockResolvedValue(undefined);
  harness.requestCloseAutoFocus.current = undefined;
  harness.agent.viewContext.register.mockClear();
  harness.overlayCloseAutoFocus.current = undefined;
  vi.mocked(focusAgentComposer).mockClear();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.appMode.current = "cloud";
  harness.calls.length = 0;
  harness.confirmations.length = 0;
  harness.deleteDataViewAction.mockReset().mockResolvedValue({ data: { id: "v-a" }, ok: true });
  harness.routerPush.mockReset();
  harness.searchParams.current = "";
  harness.upsertDataViewAction.mockReset().mockResolvedValue({ data: view({ id: "v-new", name: "Hot" }), ok: true });
  window.history.replaceState(null, "", "/en/deals");
  document.addEventListener("click", swallowNavigation);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
});

afterEach(() => {
  document.removeEventListener("click", swallowNavigation);
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("data view rail interaction", () => {
  it("does not replace the assistant context for a surface without saved views", () => {
    const host = render(store({ p13nId: undefined }));
    expect(host.querySelector("#global-data-views")).toBeNull();
    expect(harness.agent.viewContext.register).not.toHaveBeenCalled();
  });

  it("asks for a selected view's instructions before sending once through chat", () => {
    const host = render(store({ activeViewKey: OPEN.id }));
    const button = host.querySelector<HTMLButtonElement>("#global-data-views-ai");
    expect(button?.getAttribute("aria-label")).toBe("DataView.views.aiLabel(Open deals)");
    expect(button?.closest("[data-view-menu]")).not.toBeNull();
    act(() => button?.click());
    expect(host.querySelector("#view-ai-request-input")).toBeNull();
    act(() => harness.menuCloseAutoFocus.current?.(new Event("closeAutoFocus", { cancelable: true })));
    expect(host.querySelector('label[for="view-ai-request-input"]')?.textContent).toBe(
      "DataView.views.aiRequest.viewLabel",
    );
    expect(host.textContent).toContain("DataView.views.aiRequest.existingContext(Open deals)");
    expect(harness.agent.openWithDraft).not.toHaveBeenCalled();
    expect(harness.agent.sendMessage).not.toHaveBeenCalled();
    expect(focusAgentComposer).not.toHaveBeenCalled();
    expect(harness.agent.viewContext.register).toHaveBeenCalledOnce();
    typeRequest(host, "  Keep only open deals.  ");
    submitRequest(host);
    expect(host.querySelector("#view-ai-request-input")).toBeNull();
    expect(harness.agent.sendMessage).not.toHaveBeenCalled();
    expect(finishRequestClose().defaultPrevented).toBe(true);
    expect(harness.agent.openWithDraft).toHaveBeenCalledExactlyOnceWith("");
    expect(harness.agent.sendMessage).toHaveBeenCalledExactlyOnceWith(
      "DataView.views.aiEditPrompt(Open deals)\n\nKeep only open deals.",
    );
    expect(focusAgentComposer).toHaveBeenCalledOnce();
    expect(harness.agent.viewContext.register).toHaveBeenCalledTimes(2);
    expect(finishRequestClose().defaultPrevented).toBe(false);
    expect(harness.agent.sendMessage).toHaveBeenCalledOnce();
  });

  it("creates from All and preserves an existing chat draft without sending it", () => {
    const host = render(store());
    harness.agent.composerDraft = "Keep my unfinished request";
    act(() => host.querySelector<HTMLButtonElement>("#global-data-views-ai")?.click());
    act(() => harness.menuCloseAutoFocus.current?.(new Event("closeAutoFocus", { cancelable: true })));
    expect(host.textContent).toContain("DataView.views.aiRequest.newContext");
    expect(host.querySelector<HTMLTextAreaElement>("#view-ai-request-input")?.value).toBe("");
    expect(harness.agent.sendMessage).not.toHaveBeenCalled();
    typeRequest(host, "Create a view for my open deals.");
    submitRequest(host);
    finishRequestClose();
    expect(harness.agent.openWithDraft).toHaveBeenCalledExactlyOnceWith("Keep my unfinished request");
    expect(harness.agent.composerDraft).toBe("Keep my unfinished request");
    expect(harness.agent.sendMessage).toHaveBeenCalledExactlyOnceWith(
      "DataView.views.aiCreatePrompt\n\nCreate a view for my open deals.",
    );
  });

  it("keeps manual view controls available when hosted chat is disabled", () => {
    harness.agent.enabled = false;
    const host = render(store());
    expect(host.querySelector("#global-data-views-ai")).toBeNull();
    expect(host.querySelector("#global-data-views-new")).not.toBeNull();
    act(() => host.querySelector<HTMLButtonElement>("#global-data-views-new")?.click());
    expect(host.querySelector("#view-editor-ai")).toBeNull();
    expect(host.querySelector("#view-editor-name")).not.toBeNull();
  });

  it.each([
    ["", "DataView.views.aiCreatePrompt"],
    ["  Qualified leads  ", "DataView.views.aiCreateNamedPrompt(Qualified leads)"],
  ])("carries the optional name %j into the instructions submitted from the second dialog", (name, prefix) => {
    const value = store({ activeViewKey: OPEN.id });
    const host = render(value);
    act(() => host.querySelector<HTMLButtonElement>("#global-data-views-new")?.click());
    typeInto(host.querySelector<HTMLInputElement>("#view-editor-name"), name);
    const action = host.querySelector<HTMLButtonElement>("#view-editor-ai");
    expect(action?.type).toBe("button");
    expect(action?.disabled).toBe(false);
    act(() => action?.click());
    expect(host.querySelector("#view-editor-name")).toBeNull();
    expect(host.querySelector("#view-ai-request-input")).toBeNull();
    const closeEvent = new Event("closeAutoFocus", { cancelable: true });
    act(() => harness.overlayCloseAutoFocus.current?.(closeEvent));
    expect(closeEvent.defaultPrevented).toBe(true);
    expect(host.textContent).toContain(
      name.trim() ? "DataView.views.aiRequest.namedContext(Qualified leads)" : "DataView.views.aiRequest.newContext",
    );
    expect(host.querySelector('label[for="view-ai-request-input"]')?.textContent).toBe(
      "DataView.views.aiRequest.createLabel",
    );
    expect(harness.agent.sendMessage).not.toHaveBeenCalled();
    expect(focusAgentComposer).not.toHaveBeenCalled();
    typeRequest(host, "Show qualified leads with ten rows.");
    submitRequest(host);
    expect(harness.agent.sendMessage).not.toHaveBeenCalled();
    finishRequestClose();
    expect(harness.agent.sendMessage).toHaveBeenCalledExactlyOnceWith(
      `${prefix}\n\nShow qualified leads with ten rows.`,
    );
    expect(focusAgentComposer).toHaveBeenCalledOnce();
    expect(harness.upsertDataViewAction).not.toHaveBeenCalled();
    expect(value.applyView).not.toHaveBeenCalled();
    const laterEvent = new Event("closeAutoFocus", { cancelable: true });
    act(() => harness.overlayCloseAutoFocus.current?.(laterEvent));
    expect(laterEvent.defaultPrevented).toBe(false);
    expect(finishRequestClose().defaultPrevented).toBe(false);
    expect(harness.agent.sendMessage).toHaveBeenCalledOnce();
  });

  it("starts each new request empty and leaves the existing composer unchanged across repeated creation requests", () => {
    const host = render(store({ activeViewKey: OPEN.id }));
    harness.agent.composerDraft = "An unrelated unfinished request";
    for (let attempt = 0; attempt < 2; attempt++) {
      act(() => host.querySelector<HTMLButtonElement>("#global-data-views-new")?.click());
      typeInto(host.querySelector<HTMLInputElement>("#view-editor-name"), "Qualified leads");
      act(() => host.querySelector<HTMLButtonElement>("#view-editor-ai")?.click());
      act(() => harness.overlayCloseAutoFocus.current?.(new Event("closeAutoFocus", { cancelable: true })));
      expect(host.querySelector<HTMLTextAreaElement>("#view-ai-request-input")?.value).toBe("");
      typeRequest(host, `Request ${attempt + 1}.`);
      submitRequest(host);
      finishRequestClose();
      expect(harness.agent.sendMessage).toHaveBeenLastCalledWith(
        `DataView.views.aiCreateNamedPrompt(Qualified leads)\n\nRequest ${attempt + 1}.`,
      );
      expect(harness.agent.composerDraft).toBe("An unrelated unfinished request");
    }
    expect(harness.agent.sendMessage).toHaveBeenCalledTimes(2);
    expect(harness.upsertDataViewAction).not.toHaveBeenCalled();
  });

  it.each(["DataView.views.editTitle", "DataView.views.duplicate"])("keeps %s on its existing manual flow", (label) => {
    const host = render(store({ activeViewKey: OPEN.id }));
    act(() => byText(host, label).click());
    expect(host.querySelector("#view-editor-name")).not.toBeNull();
    expect(host.querySelector("#view-editor-ai")).toBeNull();
  });

  it("asks about the saved view while editing without applying an unfinished rename", () => {
    const value = store({ activeViewKey: OPEN.id });
    const host = render(value);
    act(() => byText(host, "DataView.views.editTitle").click());
    typeInto(host.querySelector<HTMLInputElement>("#view-editor-name"), "Unfinished name");
    act(() => host.querySelector<HTMLButtonElement>("#view-editor-ask-ai")?.click());
    expect(host.querySelector("#view-editor-name")).toBeNull();
    const event = new Event("closeAutoFocus", { cancelable: true });
    act(() => harness.overlayCloseAutoFocus.current?.(event));
    expect(event.defaultPrevented).toBe(true);
    expect(host.textContent).toContain("DataView.views.aiRequest.existingContext(Open deals)");
    expect(host.textContent).not.toContain("DataView.views.aiRequest.existingContext(Unfinished name)");
    expect(harness.agent.sendMessage).not.toHaveBeenCalled();
    typeRequest(host, "Sort by name.");
    submitRequest(host);
    finishRequestClose();
    expect(harness.agent.sendMessage).toHaveBeenCalledExactlyOnceWith(
      "DataView.views.aiEditPrompt(Open deals)\n\nSort by name.",
    );
    expect(harness.upsertDataViewAction).not.toHaveBeenCalled();
  });

  it("cancels a typed AI request without opening chat or replacing its existing draft", () => {
    const host = render(store({ activeViewKey: OPEN.id }));
    harness.agent.composerDraft = "Keep this draft";
    act(() => host.querySelector<HTMLButtonElement>("#global-data-views-ai")?.click());
    act(() => harness.menuCloseAutoFocus.current?.(new Event("closeAutoFocus", { cancelable: true })));
    typeRequest(host, "Cancelled view change.");
    act(() => host.querySelector<HTMLButtonElement>("#view-ai-request-cancel")?.click());
    expect(finishRequestClose().defaultPrevented).toBe(false);
    expect(harness.agent.sendMessage).not.toHaveBeenCalled();
    expect(harness.agent.openWithDraft).not.toHaveBeenCalled();
    expect(harness.agent.composerDraft).toBe("Keep this draft");
    expect(harness.agent.viewContext.register).toHaveBeenCalledOnce();
  });

  it("keeps normal cancellation focus return and does not open chat", () => {
    const host = render(store());
    act(() => host.querySelector<HTMLButtonElement>("#global-data-views-new")?.click());
    act(() => byText(host, "Common.actions.cancel").click());
    const event = new Event("closeAutoFocus", { cancelable: true });
    act(() => harness.overlayCloseAutoFocus.current?.(event));
    expect(event.defaultPrevented).toBe(false);
    expect(harness.agent.openWithDraft).not.toHaveBeenCalled();
    expect(harness.agent.sendMessage).not.toHaveBeenCalled();
  });

  it("moves focus across the tabs with the arrow keys and keeps one tab stop", () => {
    const host = render(store({ activeViewKey: "v-a" }));
    const links = chips(host);

    expect(links).toHaveLength(4);
    expect(host.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    expect(links[1].getAttribute("tabindex")).toBe("0");

    links[1].focus();
    press(links[1], "ArrowRight");
    expect(document.activeElement).toBe(links[2]);

    press(links[2], "ArrowLeft");
    expect(document.activeElement).toBe(links[1]);

    press(links[1], "End");
    expect(document.activeElement).toBe(links[3]);

    press(links[3], "Home");
    expect(document.activeElement).toBe(links[0]);

    press(links[0], "ArrowLeft");
    expect(document.activeElement).toBe(links[0]);
    expect(host.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  it("applies a view on a plain click and pushes the url afterwards, and defers to the browser otherwise", () => {
    const value = store();
    const host = render(value);
    const pushState = vi.spyOn(window.history, "pushState");
    const target = chips(host)[1];

    act(() => target.click());

    expect(value.applyView).toHaveBeenCalledExactlyOnceWith("v-a");
    expect(harness.menuOpen).toBe(true);
    expect(pushState).toHaveBeenCalledExactlyOnceWith(null, "", "/en/deals?view=v-a");
    expect(harness.calls).toEqual(["applyView"]);

    const modified = new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true });
    act(() => {
      target.dispatchEvent(modified);
    });

    expect(value.applyView).toHaveBeenCalledOnce();
    expect(pushState).toHaveBeenCalledOnce();
  });

  it("closes an open detail by routing, and routes without the locale the router adds back", () => {
    harness.searchParams.current = "threadId=t-1";
    const value = store();
    const host = render(value, "threadId");
    const pushState = vi.spyOn(window.history, "pushState");

    act(() => chips(host)[1].click());

    expect(harness.routerPush).toHaveBeenCalledExactlyOnceWith("/deals?view=v-a");
    expect(value.applyView).not.toHaveBeenCalled();
    expect(pushState).not.toHaveBeenCalled();
  });

  it("selects in place when no detail is open", () => {
    harness.searchParams.current = "";
    const value = store();
    const host = render(value, "threadId");

    act(() => chips(host)[1].click());

    expect(harness.routerPush).not.toHaveBeenCalled();
    expect(value.applyView).toHaveBeenCalledExactlyOnceWith("v-a");
  });

  it("shows a draft tab while creating, then saves the current query as a view and activates it", async () => {
    const value = store({ filters: [{ field: "stage", operator: "in", value: ["open"] }] } as unknown as Partial<
      BaseDataViewStore<Item>
    >);
    const host = render(value);
    const pushState = vi.spyOn(window.history, "pushState");

    expect(host.querySelector("[data-view-draft]")).toBeNull();
    expect(host.querySelector("#global-data-views-new")).not.toBeNull();

    act(() => host.querySelector<HTMLButtonElement>("#global-data-views-new")?.click());

    const draft = host.querySelector<HTMLElement>("[data-view-draft]");
    expect(draft).toBe(host.querySelector("#global-data-views-new"));
    expect(host.querySelectorAll("[data-view-draft]")).toHaveLength(1);
    expect(draft?.textContent).toBe("DataView.views.createTitle");
    expect(draft?.className).toContain("border-dashed");
    expect(draft?.className).toContain("border-input");
    expect(draft?.className).not.toContain("border-border");
    expect(draft?.className).toContain("h-7");
    expect(draft?.className).toContain("rounded-full");
    expect(draft?.className).toContain("px-2.5");
    expect(draft?.className).toContain("bg-transparent");
    expect(draft?.className).not.toContain("bg-secondary");
    expect(draft?.className).toContain("shadow-none");
    expect(draft?.className).not.toContain("rounded-md");
    expect(chips(host)).toHaveLength(4);

    const input = host.querySelector<HTMLInputElement>("#view-editor-name");
    expect(input).not.toBeNull();
    typeInto(input, "Hot leads");
    expect(host.querySelector("[data-view-draft]")?.textContent).toBe("DataView.views.createTitle");

    await submitMetaForm(host);

    expect(harness.upsertDataViewAction).toHaveBeenCalledExactlyOnceWith({
      name: "Hot leads",
      state: {
        columnOrder: [],
        columnWidths: {},
        filters: [{ field: "stage", operator: "in", value: ["open"] }],
        grouping: null,
        hiddenColumns: [],
        pageSize: 25,
        searchTerm: "",
        sortDescriptor: null,
        viewMode: "table",
      },
      surfaceKey: "deals-card-store",
    });
    expect(harness.calls).toEqual(["upsertDataViewAction", "refresh", "applyView"]);
    expect(value.applyView).toHaveBeenCalledExactlyOnceWith("v-new");
    expect(pushState).toHaveBeenCalledExactlyOnceWith(null, "", "/en/deals?view=v-new");
    expect(host.querySelector("[data-view-draft]")).toBeNull();
  });

  it("keeps the create overlay open when the write is refused", async () => {
    harness.upsertDataViewAction.mockResolvedValue({ error: { errors: ["nope"] }, ok: false });
    const value = store();
    const host = render(value);

    act(() => host.querySelector<HTMLButtonElement>("#global-data-views-new")?.click());
    typeInto(host.querySelector<HTMLInputElement>("#view-editor-name"), "Hot leads");
    await submitMetaForm(host);

    expect(harness.upsertDataViewAction).toHaveBeenCalledOnce();
    expect(value.applyView).not.toHaveBeenCalled();
    expect(host.querySelector("#view-editor-name")).not.toBeNull();
    expect(host.querySelector("[data-view-draft]")).not.toBeNull();
  });

  it("offers Ask AI followed by the existing active-view actions", () => {
    const host = render(store({ activeViewKey: "v-b" }));

    expect(menuLabels(host)).toEqual([
      "DataView.views.askAi",
      "DataView.views.editTitle",
      "DataView.views.duplicate",
      "DataView.views.moveLeft",
      "DataView.views.moveRight",
      "DataView.views.copyLink",
      "DataView.views.delete",
    ]);
    expect(host.querySelector("[data-view-menu]")?.textContent).not.toContain("Common.actions.save");
  });

  it("offers Ask AI, duplicate and copy link on the All tab", () => {
    const host = render(store());

    expect(menuLabels(host)).toEqual(["DataView.views.askAi", "DataView.views.duplicate", "DataView.views.copyLink"]);
    for (const absent of [
      "DataView.views.editTitle",
      "DataView.views.delete",
      "DataView.views.moveLeft",
      "DataView.views.moveRight",
    ])
      expect(menuLabels(host), absent).not.toContain(absent);
  });

  it("duplicates the All tab into a new view built from the current state", async () => {
    const value = store({ filters: [{ field: "stage", operator: "in", value: ["open"] }] } as unknown as Partial<
      BaseDataViewStore<Item>
    >);
    const host = render(value);

    act(() => byText(host, "DataView.views.duplicate").click());

    const input = host.querySelector<HTMLInputElement>("#view-editor-name");
    expect(input?.value).toBe("DataView.views.duplicateName(DataView.views.all)");
    expect(host.querySelector("[data-view-draft]")?.textContent).toBe("DataView.views.createTitle");

    await submitMetaForm(host);

    expect(harness.upsertDataViewAction).toHaveBeenCalledExactlyOnceWith({
      name: "DataView.views.duplicateName(DataView.views.all)",
      state: {
        columnOrder: [],
        columnWidths: {},
        filters: [{ field: "stage", operator: "in", value: ["open"] }],
        grouping: null,
        hiddenColumns: [],
        pageSize: 25,
        searchTerm: "",
        sortDescriptor: null,
        viewMode: "table",
      },
      surfaceKey: "deals-card-store",
    });
    expect(harness.upsertDataViewAction.mock.calls[0][0]).not.toHaveProperty("id");
    expect(harness.calls).toEqual(["upsertDataViewAction", "refresh", "applyView"]);
    expect(harness.deleteDataViewAction).not.toHaveBeenCalled();
    expect(value.applyView).toHaveBeenCalledExactlyOnceWith("v-new");
    expect(host.querySelector("[data-view-draft]")).toBeNull();
  });

  it("keeps the closing menu from dismissing the overlay it just opened, and lands focus in the name field", () => {
    const host = render(store());

    act(() => byText(host, "DataView.views.duplicate").click());

    const input = host.querySelector<HTMLInputElement>("#view-editor-name");
    expect(input).not.toBeNull();

    const close = harness.menuCloseAutoFocus.current;
    expect(
      close,
      "the menu must handle its own close focus, or Radix returns focus to the trigger and dismisses the overlay",
    ).toBeTypeOf("function");

    const event = new Event("closeAutoFocus", { cancelable: true });
    act(() => close?.(event));

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input);
  });

  it("preserves primitive focus handling when there is no intentional overlay handoff", () => {
    const host = render(store({ activeViewKey: "v-b" }));
    const outsideControl = host.querySelector<HTMLButtonElement>("#global-data-views-new");
    outsideControl?.focus();

    const close = harness.menuCloseAutoFocus.current;
    const event = new Event("closeAutoFocus", { cancelable: true });
    act(() => close?.(event));

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(outsideControl);
  });

  it("renames the active view through the edit overlay with the store's live state", async () => {
    const value = store({ activeViewKey: "v-c" });
    const host = render(value);

    act(() => byText(host, "DataView.views.editTitle").click());

    const input = host.querySelector<HTMLInputElement>("#view-editor-name");
    expect(input?.value).toBe("Closing");
    expect(host.querySelector("[data-view-draft]")).toBeNull();

    typeInto(input, "Closed");
    await submitMetaForm(host);

    expect(harness.upsertDataViewAction).toHaveBeenCalledExactlyOnceWith({
      id: "v-c",
      name: "Closed",
      position: undefined,
      state: {
        columnOrder: [],
        columnWidths: {},
        filters: [],
        grouping: null,
        hiddenColumns: [],
        pageSize: 25,
        searchTerm: "",
        sortDescriptor: null,
        viewMode: "table",
      },
      surfaceKey: "deals-card-store",
    });
    expect(harness.calls).toEqual(["upsertDataViewAction", "refresh"]);
    expect(host.querySelector("#view-editor-name")).toBeNull();
  });

  it("deletes through the shared confirmation, falls back to All and returns focus to it", async () => {
    const value = store({ activeViewKey: "v-a" });
    const host = render(value);

    act(() => byText(host, "DataView.views.delete").click());

    expect(harness.deleteDataViewAction).not.toHaveBeenCalled();
    expect(harness.confirmations).toHaveLength(1);
    expect(harness.confirmations[0].entityName).toBe("Ada");

    await act(async () => {
      expect(await harness.confirmations[0].onConfirm()).toBe(true);
    });

    expect(harness.deleteDataViewAction).toHaveBeenCalledExactlyOnceWith({ id: "v-a" });
    expect(value.applyView).toHaveBeenCalledExactlyOnceWith(ALL_VIEW_KEY);
    expect(value.refresh).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(host.querySelector("#global-data-views-all"));
  });

  it("swaps positions with the neighbouring view when reordering", async () => {
    const value = store({ activeViewKey: "v-c" });
    const host = render(value);

    await act(async () => {
      byText(host, "DataView.views.moveLeft").click();
      await Promise.resolve();
    });

    expect(harness.upsertDataViewAction).toHaveBeenCalledTimes(2);
    expect(harness.upsertDataViewAction.mock.calls[0][0]).toMatchObject({ id: "v-c", position: 1 });
    expect(harness.upsertDataViewAction.mock.calls[1][0]).toMatchObject({ id: "v-b", position: 2 });
    expect(byText(host, "DataView.views.moveRight").disabled).toBe(true);
  });
});
