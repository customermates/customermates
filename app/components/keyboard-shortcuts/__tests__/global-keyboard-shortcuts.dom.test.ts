import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  agentChatEnabled: true,
  agentConfigEnabled: true as boolean | null,
  singleKeyShortcutsEnabled: true,
  routeReady: true,
  openSearch: vi.fn(),
  toggleAgent: vi.fn(),
  openAdd: vi.fn(),
  openShortcuts: vi.fn(),
  openViewPicker: vi.fn(),
  viewSurface: null as object | null,
  push: vi.fn(),
  tryNavigate: vi.fn((navigate: () => void) => navigate()),
  toast: vi.fn(),
  dismiss: vi.fn(),
}));

vi.mock("next/navigation", () => ({ usePathname: () => "/en/dashboard" }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("sonner", () => ({
  toast: Object.assign(state.toast, { dismiss: state.dismiss }),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: state.push }),
}));
vi.mock("@/core/stores/root-store.provider", () => {
  const keyboardShortcutsStore = {
    get singleKeyShortcutsEnabled() {
      return state.singleKeyShortcutsEnabled;
    },
    destinations: {
      pages: {
        dashboard: "/dashboard",
        inbox: "/inbox",
        settings: "/settings/profile",
      },
      lists: ["/records/a", "/records/b"],
    },
    openFrom: state.openShortcuts,
  };
  const rootStore = {
    get agentChatEnabled() {
      return state.agentChatEnabled;
    },
    get agentChatStore() {
      return { enabled: state.agentConfigEnabled, toggle: state.toggleAgent };
    },
    recordWorkspaceStore: { routeReady: () => state.routeReady },
    globalSearchModalStore: { openFrom: state.openSearch },
    addPickerStore: { openFrom: state.openAdd },
    viewPickerStore: {
      get surface() {
        return state.viewSurface;
      },
      openFrom: state.openViewPicker,
    },
    navigationGuard: { tryNavigate: state.tryNavigate },
    keyboardShortcutsStore,
  };
  return { useRootStore: () => rootStore };
});

import { GlobalKeyboardShortcuts } from "../global-keyboard-shortcuts";

let container: HTMLDivElement;
let root: Root;

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) {
  const code = init.code ?? (/^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : /^\d$/.test(key) ? `Digit${key}` : "");
  const event = new KeyboardEvent("keydown", {
    key,
    code,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(state, {
    agentChatEnabled: true,
    agentConfigEnabled: true,
    singleKeyShortcutsEnabled: true,
    routeReady: true,
    viewSurface: null,
  });
  for (const mock of [
    state.openSearch,
    state.toggleAgent,
    state.openAdd,
    state.openShortcuts,
    state.openViewPicker,
    state.push,
    state.toast,
  ])
    mock.mockClear();
  state.tryNavigate.mockClear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  act(() => {
    root.render(createElement(GlobalKeyboardShortcuts));
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("global keyboard shortcuts", () => {
  it("opens search with Ctrl+K and toggles Mate with Ctrl+J outside a Mac", () => {
    expect(press("k", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(state.openSearch).toHaveBeenCalledOnce();
    expect(press("j", { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(state.toggleAgent).toHaveBeenCalledOnce();
    press("k", { metaKey: true });
    expect(state.openSearch).toHaveBeenCalledOnce();
  });

  it("works on non-Latin layouts and while typing", () => {
    const input = document.createElement("input");
    document.body.append(input);
    press("л", { ctrlKey: true, code: "KeyK" }, input);
    expect(state.openSearch).toHaveBeenCalledOnce();
  });

  it("leaves Ctrl+J alone while the assistant config is unresolved", () => {
    state.agentConfigEnabled = null;
    expect(press("j", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(state.toggleAgent).not.toHaveBeenCalled();
  });

  it("does nothing until the route is ready", () => {
    state.routeReady = false;
    press("k", { ctrlKey: true });
    press("c");
    expect(state.openSearch).not.toHaveBeenCalled();
    expect(state.openAdd).not.toHaveBeenCalled();
  });

  it("opens Add with C and the shortcuts dialog with ?", () => {
    press("c");
    expect(state.openAdd).toHaveBeenCalledOnce();
    press("?", { shiftKey: true, code: "Slash" });
    expect(state.openShortcuts).toHaveBeenCalledOnce();
  });

  it("opens search with / and the view picker with V only where a list offers views", () => {
    press("/", { code: "Slash" });
    expect(state.openSearch).toHaveBeenCalledOnce();
    press("v");
    expect(state.openViewPicker).not.toHaveBeenCalled();
    state.viewSurface = {};
    press("v");
    expect(state.openViewPicker).toHaveBeenCalledOnce();
  });

  it("leaves / and V to fields, editors and the Mate composer", () => {
    state.viewSurface = {};
    const input = document.createElement("input");
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    const mate = document.createElement("div");
    mate.setAttribute("data-agent-surface", "");
    const composer = document.createElement("div");
    composer.setAttribute("contenteditable", "true");
    mate.append(composer);
    document.body.append(input, editor, mate);
    for (const target of [input, editor, composer]) {
      expect(press("/", { code: "Slash" }, target).defaultPrevented).toBe(false);
      expect(press("v", {}, target).defaultPrevented).toBe(false);
    }
    expect(state.openSearch).not.toHaveBeenCalled();
    expect(state.openViewPicker).not.toHaveBeenCalled();
  });

  it("ignores single keys while typing, inside an open dialog and after a handler claimed them", () => {
    const input = document.createElement("input");
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    document.body.append(input, editor);
    press("c", {}, input);
    press("c", {}, editor);
    press("c", { isComposing: true });

    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.dataset.state = "open";
    document.body.append(dialog);
    press("c");
    press("g");
    dialog.remove();

    const claimed = new KeyboardEvent("keydown", {
      key: "c",
      code: "KeyC",
      bubbles: true,
      cancelable: true,
    });
    claimed.preventDefault();
    act(() => {
      document.body.dispatchEvent(claimed);
    });

    press("d");
    expect(state.openAdd).not.toHaveBeenCalled();
    expect(state.push).not.toHaveBeenCalled();
  });

  it("navigates with G then a letter or list position through the navigation guard", () => {
    press("g");
    press("d");
    expect(state.tryNavigate).toHaveBeenCalledOnce();
    expect(state.push).toHaveBeenLastCalledWith("/dashboard");
    press("d");
    expect(state.push).toHaveBeenCalledOnce();

    press("g");
    press("2");
    expect(state.push).toHaveBeenLastCalledWith("/records/b");

    press("g");
    press("Shift");
    press("s");
    expect(state.push).toHaveBeenLastCalledWith("/settings/profile");
  });

  it("skips destinations the person cannot open and keys after the timeout", () => {
    press("g");
    press("9");
    press("g");
    press("r");
    expect(state.push).not.toHaveBeenCalled();

    press("g");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(state.toast).toHaveBeenCalledOnce();
    act(() => {
      vi.advanceTimersByTime(700);
    });
    press("d");
    expect(state.push).not.toHaveBeenCalled();
  });

  it("does not start a G sequence or open Add when single-key shortcuts are off", () => {
    state.singleKeyShortcutsEnabled = false;
    press("c");
    press("g");
    press("d");
    expect(state.openAdd).not.toHaveBeenCalled();
    expect(state.push).not.toHaveBeenCalled();
    press("k", { ctrlKey: true });
    expect(state.openSearch).toHaveBeenCalledOnce();
  });
});
