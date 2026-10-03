// @vitest-environment jsdom

import type { ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { RootStore } from "@/core/stores/root.store";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const testContext = vi.hoisted(() => ({ rootStore: null as unknown }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/app/[locale]/(protected)/records/actions", () => ({
  getRecordAction: vi.fn(),
  getRecordNavigationAction: vi.fn(),
}));
vi.mock("@/hooks/use-media-query", () => ({ useIsWiderThan: () => true }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => testContext.rootStore,
}));
vi.mock("@/components/ai-elements/message", () => ({
  MessageResponse: ({ children }: { children: ReactNode }) => createElement("span", null, children),
}));

import { AgentTourOverlay } from "@/app/components/agent-chat/agent-tour-overlay";
import { AgentUiControlStore } from "@/app/components/agent-chat/ui-control.store";

let container: HTMLDivElement;
let reactRoot: Root;

function laidOut(element: HTMLElement, rendered: boolean) {
  element.getClientRects = () => (rendered ? [new DOMRect(10, 10, 80, 20)] : []) as unknown as DOMRectList;
  element.getBoundingClientRect = () => new DOMRect(10, 10, rendered ? 80 : 0, rendered ? 20 : 0);
}

function control(id: string) {
  const element = document.createElement("button");
  element.id = id;
  element.scrollIntoView = vi.fn();
  laidOut(element, true);
  document.body.append(element);
  return element;
}

function tourCard() {
  return document.querySelector<HTMLElement>('[data-slot="popover-content"]');
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function startWidgetTour(store: AgentUiControlStore) {
  await act(async () => {
    const started = store.startGuidedTour([
      { targetId: "dashboard-add-widget", note: "Click Add widget." },
      { targetId: "widget-modal-kind", note: "Pick Chart." },
      { targetId: "widget-modal-save", note: "Create the widget." },
    ]);
    await vi.advanceTimersByTimeAsync(0);
    await started;
  });
  await act(async () => {
    store.nextStep();
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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
  vi.useRealTimers();
});

function renderOverlay() {
  const store = new AgentUiControlStore({
    appMode: "cloud",
    userStore: { canAccess: () => true },
  } as unknown as RootStore);
  store.registerNavigate(() => Promise.resolve("navigated"));
  testContext.rootStore = { agentUiControlStore: store };
  act(() => reactRoot.render(createElement(AgentTourOverlay)));
  return store;
}

describe("a tour stop whose control loses its layout", () => {
  it("keeps the tour card on screen so Escape still ends the tour", async () => {
    control("dashboard-add-widget");
    const kind = control("widget-modal-kind");
    const store = renderOverlay();
    await startWidgetTour(store);
    expect(store.active?.targetId).toBe("widget-modal-kind");
    expect(tourCard()?.textContent).toContain("2 / 3");

    laidOut(kind, false);
    await advance(300);

    expect(tourCard()?.textContent).toContain("2 / 3");
    expect(tourCard()?.querySelector('button[aria-label="AgentChat.tour.skip"]')).not.toBeNull();

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(store.active).toBeNull();
  });

  it("moves the tour on to the next stop once the control stays gone", async () => {
    control("dashboard-add-widget");
    const kind = control("widget-modal-kind");
    const store = renderOverlay();
    await startWidgetTour(store);

    kind.remove();
    control("widget-modal-save");
    await advance(2400);

    expect(store.active?.targetId).toBe("widget-modal-save");
    expect(tourCard()?.textContent).toContain("3 / 3");
  });
});
