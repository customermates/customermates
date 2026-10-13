import type { HomepageStageTab } from "@/core/fumadocs/schemas/homepage";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const motionState = vi.hoisted(() => ({ isInView: true, shouldAnimate: true, shouldReduceMotion: false }));
vi.mock("@/app/[locale]/(static)/components/homepage-motion", () => ({
  useHomepageMotion: () => ({ ref: { current: null }, ...motionState }),
}));
vi.mock("framer-motion", () => {
  function strip(tag: string) {
    function MotionMock({
      animate: _animate,
      initial: _initial,
      layoutId: _layoutId,
      transition: _transition,
      ...props
    }: Record<string, unknown> & { animate?: unknown; initial?: unknown; layoutId?: unknown; transition?: unknown }) {
      return createElement(tag, props);
    }

    return MotionMock;
  }

  return { motion: { circle: strip("circle"), p: strip("p"), span: strip("span") } };
});
import {
  HomepageProductStage,
  LIVE_REVEAL_DELAY_MS,
  PRODUCT_STAGE_INTERVAL_MS,
} from "@/app/[locale]/(static)/components/homepage-product-stage";
import { HomepageStageLink } from "@/app/[locale]/(static)/components/homepage-stage-link";

const tabs: HomepageStageTab[] = [
  { alt: "Inbox, using demo data", capture: "homepage-inbox", caption: "Inbox caption", label: "Inbox" },
  { alt: "Record, using demo data", capture: "homepage-record", caption: "Record caption", label: "Customers" },
  { alt: "Pipeline, using demo data", capture: "homepage-pipeline", caption: "Pipeline caption", label: "Pipeline" },
  {
    alt: "Dashboard, using demo data",
    capture: "homepage-dashboard",
    caption: "Dashboard caption",
    label: "Dashboard",
  },
  { alt: "Routines, using demo data", capture: "homepage-routines", caption: "Routines caption", label: "Routines" },
];

let root: ReturnType<typeof createRoot> | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  motionState.isInView = true;
  motionState.shouldAnimate = true;
  motionState.shouldReduceMotion = false;
});

function render() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      createElement(HomepageProductStage, {
        demoBaseUrl: "https://demo.example",
        label: "Product areas",
        live: { prompt: "Try it live" },
        locale: "en",
        tabs,
      }),
    ),
  );
  return host;
}

function tabButtons(host: HTMLElement) {
  return Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
}

function selectedLabel(host: HTMLElement) {
  return host.querySelector('[role="tab"][aria-selected="true"]')?.textContent;
}

function progress(host: HTMLElement) {
  return host.querySelector("[data-homepage-stage-progress]")?.getAttribute("data-homepage-stage-progress");
}

function advance(milliseconds: number) {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

function press(target: HTMLElement, key: string) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }));
  });
}

it("advances every interval while visible, wraps around, and shows a running progress bar", () => {
  vi.useFakeTimers();
  const host = render();

  expect(selectedLabel(host)).toContain("Inbox");
  expect(progress(host)).toBe("running");
  advance(PRODUCT_STAGE_INTERVAL_MS - 1);
  expect(selectedLabel(host)).toContain("Inbox");
  advance(1);
  expect(selectedLabel(host)).toContain("Customers");

  for (let step = 0; step < tabs.length - 1; step += 1) advance(PRODUCT_STAGE_INTERVAL_MS);

  expect(selectedLabel(host)).toContain("Inbox");
});

it("stops for good once a visitor picks a tab", () => {
  vi.useFakeTimers();
  const host = render();

  act(() => tabButtons(host)[2].click());
  expect(selectedLabel(host)).toContain("Pipeline");
  expect(progress(host)).toBe("static");
  advance(PRODUCT_STAGE_INTERVAL_MS * 3);
  expect(selectedLabel(host)).toContain("Pipeline");
});

it("moves selection and focus with arrow, Home and End keys and wraps at the ends", () => {
  vi.useFakeTimers();
  const host = render();
  const buttons = tabButtons(host);

  press(buttons[0], "ArrowLeft");
  expect(selectedLabel(host)).toContain("Routines");
  expect(document.activeElement).toBe(buttons[4]);
  press(buttons[4], "ArrowRight");
  expect(selectedLabel(host)).toContain("Inbox");
  expect(document.activeElement).toBe(buttons[0]);
  press(buttons[0], "End");
  expect(selectedLabel(host)).toContain("Routines");
  press(buttons[4], "Home");
  expect(selectedLabel(host)).toContain("Inbox");
  expect(buttons.map((button) => button.tabIndex)).toEqual([0, -1, -1, -1, -1]);
  advance(PRODUCT_STAGE_INTERVAL_MS * 2);
  expect(selectedLabel(host)).toContain("Inbox");
});

it("pauses while hovered and resumes with a full interval after the pointer leaves", () => {
  vi.useFakeTimers();
  const host = render();
  const stage = host.querySelector<HTMLElement>('[data-homepage-section="product-stage"]');

  if (!stage) throw new Error("stage missing");

  act(() => {
    stage.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body }));
  });
  expect(progress(host)).toBe("static");
  advance(PRODUCT_STAGE_INTERVAL_MS * 2);
  expect(selectedLabel(host)).toContain("Inbox");

  act(() => {
    stage.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
  });
  expect(progress(host)).toBe("running");
  advance(PRODUCT_STAGE_INTERVAL_MS);
  expect(selectedLabel(host)).toContain("Customers");
});

it("stops when keyboard focus enters the stage or a pointer touches the tabs", () => {
  vi.useFakeTimers();
  const focusHost = render();

  act(() => tabButtons(focusHost)[0].focus());
  advance(PRODUCT_STAGE_INTERVAL_MS * 2);
  expect(selectedLabel(focusHost)).toContain("Inbox");
  expect(document.activeElement).toBe(tabButtons(focusHost)[0]);

  act(() => root?.unmount());
  document.body.replaceChildren();
  const touchHost = render();

  act(() => {
    touchHost.querySelector('[role="tablist"]')?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  });
  advance(PRODUCT_STAGE_INTERVAL_MS * 2);
  expect(selectedLabel(touchHost)).toContain("Inbox");
});

it("keeps a static first frame with reduced motion and while off screen", () => {
  vi.useFakeTimers();
  motionState.shouldAnimate = false;
  motionState.shouldReduceMotion = true;
  const reducedHost = render();

  expect(progress(reducedHost)).toBe("static");
  advance(PRODUCT_STAGE_INTERVAL_MS * 3);
  expect(selectedLabel(reducedHost)).toContain("Inbox");

  act(() => root?.unmount());
  document.body.replaceChildren();
  motionState.shouldReduceMotion = false;
  const offscreenHost = render();

  advance(PRODUCT_STAGE_INTERVAL_MS * 3);
  expect(selectedLabel(offscreenHost)).toContain("Inbox");
});

it("wires tabs to panels, keeps inactive panels inert, and renders a chosen panel at once", () => {
  vi.useFakeTimers();
  const host = render();
  const buttons = tabButtons(host);
  const panels = Array.from(host.querySelectorAll<HTMLElement>('[role="tabpanel"]'));

  expect(host.querySelector('[role="tablist"]')?.getAttribute("aria-label")).toBe("Product areas");
  for (const [index, button] of buttons.entries()) {
    expect(button.getAttribute("aria-controls")).toBe(panels[index].id);
    expect(panels[index].getAttribute("aria-labelledby")).toBe(button.id);
  }
  expect(panels.map((panel) => panel.hasAttribute("inert"))).toEqual([false, true, true, true, true]);
  expect(panels.map((panel) => panel.tabIndex)).toEqual([0, -1, -1, -1, -1]);
  expect(panels[4].querySelector("img")).toBeNull();
  expect(host.querySelector("[aria-live]")).toBeNull();

  act(() => buttons[4].click());

  expect(panels.map((panel) => panel.hasAttribute("inert"))).toEqual([true, true, true, true, false]);
  expect(panels[4].tabIndex).toBe(0);
  expect(panels[4].querySelector("img")?.getAttribute("alt")).toBe("Routines, using demo data");
  expect(panels[4].querySelector("source")?.getAttribute("media")).toBe("(min-width: 40rem)");
  expect(panels[0].querySelector("img")?.getAttribute("loading")).toBe("eager");
  expect(panels[4].querySelector("img")?.getAttribute("loading")).toBe("lazy");
});

it("scrolls only the tab strip to bring the advanced tab into view", () => {
  vi.useFakeTimers();
  const host = render();
  const list = host.querySelector<HTMLElement>('[role="tablist"]');
  const scrollTo = vi.fn();
  const pageScroll = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);

  if (!list) throw new Error("tablist missing");

  Object.defineProperty(list, "scrollWidth", { configurable: true, value: 800 });
  Object.defineProperty(list, "clientWidth", { configurable: true, value: 320 });
  list.scrollTo = scrollTo as typeof list.scrollTo;
  for (const [index, button] of tabButtons(host).entries())
    Object.defineProperty(button, "offsetLeft", { configurable: true, value: 16 + index * 160 });

  advance(PRODUCT_STAGE_INTERVAL_MS);

  expect(selectedLabel(host)).toContain("Customers");
  expect(scrollTo).toHaveBeenLastCalledWith({ behavior: "smooth", left: 176 });
  expect(pageScroll).not.toHaveBeenCalled();
  pageScroll.mockRestore();
});

function stubWideViewport(matches: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches, media: query }));
}

function activeIframe(host: HTMLElement) {
  return host.querySelector<HTMLIFrameElement>('iframe[data-homepage-stage-iframe="active"]');
}

function loadAndReveal(iframe: HTMLIFrameElement | null) {
  act(() => {
    iframe?.dispatchEvent(new Event("load"));
  });
  advance(LIVE_REVEAL_DELAY_MS);
}

function frame(host: HTMLElement) {
  const element = host.querySelector<HTMLElement>("[data-homepage-stage-frame]");
  if (!element) throw new Error("stage frame missing");
  return element;
}

it("goes live on a wide viewport right after the page loads, before the stage is scrolled into view", () => {
  vi.useFakeTimers();
  stubWideViewport(true);
  motionState.isInView = false;
  motionState.shouldAnimate = false;
  const host = render();

  expect(activeIframe(host)?.getAttribute("src")).toBe(
    "https://demo.example/en/inbox?threadId=latest&agentChat=closed",
  );
  expect(frame(host).getAttribute("data-homepage-stage-live")).toBe("loading");
});

it("shows every tab as its own live iframe, keeps rotating and preloads the next area", () => {
  vi.useFakeTimers();
  stubWideViewport(true);
  const host = render();

  const inbox = activeIframe(host);
  expect(inbox?.getAttribute("title")).toBe("Try it live: Inbox");
  expect(host.querySelectorAll("iframe")).toHaveLength(1);
  expect(host.textContent).not.toContain("Try it live");

  act(() => {
    inbox?.dispatchEvent(new Event("load"));
  });
  expect(frame(host).getAttribute("data-homepage-stage-live")).toBe("loading");
  advance(LIVE_REVEAL_DELAY_MS);
  expect(frame(host).getAttribute("data-homepage-stage-live")).toBe("ready");
  expect(progress(host)).toBe("running");
  expect(host.querySelectorAll("iframe")).toHaveLength(2);
  expect(host.querySelector('iframe[data-homepage-stage-iframe="standby"]')?.getAttribute("src")).toBe(
    "https://demo.example/en/contacts?agentChat=closed",
  );

  advance(PRODUCT_STAGE_INTERVAL_MS - LIVE_REVEAL_DELAY_MS);
  expect(selectedLabel(host)).toContain("Customers");
  expect(activeIframe(host)?.getAttribute("src")).toBe("https://demo.example/en/contacts?agentChat=closed");
  expect(activeIframe(host)?.hasAttribute("inert")).toBe(false);
  expect(host.querySelector('iframe[data-homepage-stage-iframe="standby"]')?.hasAttribute("inert")).toBe(true);
});

it("keeps rotating when a live iframe takes focus by itself, and stops when a visitor clicks into it", () => {
  vi.useFakeTimers();
  stubWideViewport(true);
  const host = render();
  const stage = host.querySelector<HTMLElement>('[data-homepage-section="product-stage"]');

  if (!stage) throw new Error("stage missing");

  loadAndReveal(activeIframe(host));
  act(() => {
    activeIframe(host)?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  });
  advance(PRODUCT_STAGE_INTERVAL_MS);
  expect(selectedLabel(host)).toContain("Customers");

  act(() => {
    stage.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body }));
  });
  act(() => {
    activeIframe(host)?.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
  });
  act(() => {
    stage.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
  });
  advance(PRODUCT_STAGE_INTERVAL_MS * 2);
  expect(selectedLabel(host)).toContain("Customers");
});

it("stops rotating on the live area a visitor picks", () => {
  vi.useFakeTimers();
  stubWideViewport(true);
  const host = render();

  loadAndReveal(activeIframe(host));
  act(() => tabButtons(host)[2].click());
  expect(activeIframe(host)?.getAttribute("src")).toBe("https://demo.example/en/deals?agentChat=closed");
  expect(frame(host).getAttribute("data-homepage-stage-live")).toBe("loading");
  expect(progress(host)).toBe("static");
  loadAndReveal(activeIframe(host));
  expect(frame(host).getAttribute("data-homepage-stage-live")).toBe("ready");
  advance(PRODUCT_STAGE_INTERVAL_MS * 3);
  expect(selectedLabel(host)).toContain("Pipeline");
});

it("tilts the frame below the fold and straightens it once scrolled into view", () => {
  const prototypeRect = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockReturnValue({ top: window.innerHeight * 0.9 } as DOMRect);
  const below = render();
  expect(frame(below).style.getPropertyValue("--stage-tilt")).toBe("12.00deg");
  expect(frame(below).style.getPropertyValue("--stage-scale")).toBe("0.9400");
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();

  prototypeRect.mockReturnValue({ top: 0 } as DOMRect);
  const inView = render();
  expect(frame(inView).style.getPropertyValue("--stage-tilt")).toBe("0.00deg");
  expect(frame(inView).style.getPropertyValue("--stage-scale")).toBe("1.0000");
  prototypeRect.mockRestore();
});

it("keeps the frame flat with reduced motion", () => {
  motionState.shouldAnimate = false;
  motionState.shouldReduceMotion = true;
  const prototypeRect = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockReturnValue({ top: window.innerHeight * 0.9 } as DOMRect);
  const host = render();

  expect(frame(host).style.getPropertyValue("--stage-tilt")).toBe("");
  prototypeRect.mockRestore();
});

it("keeps the static captures on a phone-width viewport", () => {
  vi.useFakeTimers();
  stubWideViewport(false);
  const host = render();

  act(() => {
    frame(host).dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  });
  act(() => tabButtons(host)[1].click());

  expect(host.querySelector("iframe")).toBeNull();
  expect(frame(host).getAttribute("data-homepage-stage-live")).toBe("idle");
});

it("drops the live iframes when the viewport narrows to phone width", () => {
  vi.useFakeTimers();
  let matches = true;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return matches;
    },
    media: query,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }));
  const host = render();

  expect(activeIframe(host)).not.toBeNull();

  matches = false;
  act(() => {
    for (const listener of listeners) listener();
  });

  expect(host.querySelector("iframe")).toBeNull();
  expect(frame(host).getAttribute("data-homepage-stage-live")).toBe("idle");
});

it("opens the area a capture link names, live on a wide viewport", () => {
  vi.useFakeTimers();
  stubWideViewport(true);
  const host = render();
  const linkHost = document.createElement("div");
  document.body.append(linkHost);
  const linkRoot = createRoot(linkHost);

  act(() =>
    linkRoot.render(
      <HomepageStageLink area="routines" label="Try it live">
        Routines capture
      </HomepageStageLink>,
    ),
  );
  const link = linkHost.querySelector<HTMLAnchorElement>("a[data-homepage-stage-link]");
  expect(link?.getAttribute("href")).toBe("#product-demo");

  act(() => link?.click());

  expect(selectedLabel(host)).toContain("Routines");
  expect(activeIframe(host)?.getAttribute("src")).toBe("https://demo.example/en/routines?agentChat=closed");
  advance(PRODUCT_STAGE_INTERVAL_MS * 2);
  expect(selectedLabel(host)).toContain("Routines");
  act(() => linkRoot.unmount());
});

it("opens from a product-demo hash on load and ignores unrelated hashes", () => {
  vi.useFakeTimers();
  stubWideViewport(true);
  window.history.replaceState(null, "", "#product-demo-customers");
  const host = render();

  expect(selectedLabel(host)).toContain("Customers");
  expect(activeIframe(host)?.getAttribute("src")).toBe("https://demo.example/en/contacts?agentChat=closed");

  act(() => root?.unmount());
  document.body.replaceChildren();
  window.history.replaceState(null, "", "#pricing");
  const unrelated = render();

  expect(selectedLabel(unrelated)).toContain("Inbox");
  expect(activeIframe(unrelated)?.getAttribute("src")).toBe(
    "https://demo.example/en/inbox?threadId=latest&agentChat=closed",
  );
  window.history.replaceState(null, "", "#");
});
