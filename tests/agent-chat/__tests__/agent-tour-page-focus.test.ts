// @vitest-environment jsdom

import type { ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { RootStore } from "@/core/stores/root.store";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testContext = vi.hoisted(() => ({ rootStore: null as unknown }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => testContext.rootStore }));
vi.mock("@/components/ai-elements/message", () => ({
  MessageResponse: ({ children }: { children: ReactNode }) => createElement("span", null, children),
}));

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgentTourOverlay } from "@/app/components/agent-chat/agent-tour-overlay";
import { AgentUiControlStore } from "@/app/components/agent-chat/ui-control.store";

const getClientRects = Object.getOwnPropertyDescriptor(Element.prototype, "getClientRects");

let container: HTMLDivElement;
let reactRoot: Root;

function ChannelDialogTabs() {
  return createElement(
    Tabs,
    { defaultValue: "email" },
    createElement(
      TabsList,
      null,
      createElement(TabsTrigger, { id: "channel-tab-email", value: "email" }, "Email"),
      createElement(TabsTrigger, { id: "channel-tab-details", value: "details" }, "Details"),
    ),
  );
}

function tourControl(id: string) {
  const element = document.createElement("button");
  element.id = id;
  element.scrollIntoView = vi.fn();
  document.body.append(element);
}

function tab(id: string) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing tab ${id}`);
  return element;
}

async function startTour(startFocus: () => HTMLElement) {
  tourControl("dashboard-add-widget");
  tourControl("widget-modal-kind");
  const store = new AgentUiControlStore({
    appMode: "cloud",
    userStore: { canAccess: () => true },
  } as unknown as RootStore);
  store.registerNavigate(() => Promise.resolve("navigated"));
  testContext.rootStore = { agentUiControlStore: store };
  act(() =>
    reactRoot.render(createElement("div", null, createElement(ChannelDialogTabs), createElement(AgentTourOverlay))),
  );

  act(() => startFocus().focus());
  await act(async () => {
    await store.startGuidedTour([
      { targetId: "dashboard-add-widget", note: "Click Add widget." },
      { targetId: "widget-modal-kind", note: "Pick Chart." },
    ]);
  });
  return store;
}

function startTourFromEmailTab() {
  return startTour(() => tab("channel-tab-email"));
}

function assistantComposer() {
  const panel = document.createElement("div");
  panel.setAttribute("data-agent-surface", "");
  const composer = document.createElement("div");
  composer.id = "agent-composer";
  composer.tabIndex = 0;
  panel.append(composer);
  document.body.append(panel);
  return composer;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(Element.prototype, "getClientRects", {
    configurable: true,
    value: () => [new DOMRect(0, 0, 10, 10)],
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  window.history.replaceState(null, "", "/en/dashboard");
  container = document.createElement("div");
  document.body.append(container);
  reactRoot = createRoot(container);
});

afterEach(() => {
  act(() => reactRoot.unmount());
  document.body.replaceChildren();
  testContext.rootStore = null;
  vi.unstubAllGlobals();
  if (getClientRects) Object.defineProperty(Element.prototype, "getClientRects", getClientRects);
});

describe("ending a tour after the user moved focus on the page", () => {
  it("keeps the tab the user chose instead of refocusing the tab focused at tour start", async () => {
    const store = await startTourFromEmailTab();
    expect(store.active?.targetId).toBe("dashboard-add-widget");

    act(() => tab("channel-tab-details").focus());
    expect(tab("channel-tab-details").getAttribute("data-state")).toBe("active");

    act(() => store.end());

    expect(document.activeElement).toBe(tab("channel-tab-details"));
    expect(tab("channel-tab-details").getAttribute("data-state")).toBe("active");
    expect(tab("channel-tab-email").getAttribute("data-state")).toBe("inactive");
  });

  it("returns focus to the element focused at tour start when the user stayed in the tour card", async () => {
    const store = await startTourFromEmailTab();
    const card = document.querySelector<HTMLElement>('[data-slot="popover-content"]');
    expect(card?.contains(document.activeElement)).toBe(true);

    act(() => store.end());

    expect(document.activeElement).toBe(tab("channel-tab-email"));
    expect(tab("channel-tab-email").getAttribute("data-state")).toBe("active");
  });

  it("falls back to the element focused at tour start when the page control the user focused unmounts", async () => {
    const composer = assistantComposer();
    const store = await startTour(() => composer);
    const pageButton = document.createElement("button");
    document.body.append(pageButton);

    act(() => pageButton.focus());
    pageButton.remove();
    act(() => store.end());

    expect(document.activeElement).toBe(composer);
  });
});
