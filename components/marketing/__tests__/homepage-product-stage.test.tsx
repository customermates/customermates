import type { HomepageStageTab } from "@/core/fumadocs/schemas/homepage";

import { act, type ComponentProps, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

const motionState = vi.hoisted(() => ({ shouldAnimate: true, shouldReduceMotion: false }));
vi.mock("@/app/[locale]/(static)/components/homepage-motion", () => ({
  useHomepageMotion: () => ({ ref: { current: null }, ...motionState }),
}));
vi.mock("framer-motion", () => ({
  motion: {
    span: ({
      animate: _animate,
      initial: _initial,
      transition: _transition,
      ...props
    }: ComponentProps<"span"> & { animate?: unknown; initial?: unknown; transition?: unknown }) =>
      createElement("span", props),
  },
}));
import {
  HomepageProductStage,
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
        disclosure: "Sample data.",
        label: "Product areas",
        live: { prompt: "Try it live", status: "Live demo." },
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

function frame(host: HTMLElement) {
  const element = host.querySelector<HTMLElement>("[data-homepage-stage-frame]");
  if (!element) throw new Error("stage frame missing");
  return element;
}

it("goes live on a wide viewport, opens the chosen area in the demo and stops rotating", () => {
  vi.useFakeTimers();
  stubWideViewport(true);
  const host = render();

  expect(host.querySelector("iframe")).toBeNull();
  expect(frame(host).getAttribute("data-homepage-stage-live")).toBe("idle");

  act(() => tabButtons(host)[2].click());

  const iframe = host.querySelector("iframe");
  expect(iframe?.getAttribute("src")).toBe("https://demo.example/en/deals?agentChat=closed");
  expect(frame(host).getAttribute("data-homepage-stage-live")).toBe("loading");

  act(() => {
    iframe?.dispatchEvent(new Event("load"));
  });
  expect(frame(host).getAttribute("data-homepage-stage-live")).toBe("ready");
  expect(host.textContent).toContain("Live demo.");

  act(() => tabButtons(host)[0].click());
  expect(host.querySelector("iframe")?.getAttribute("src")).toBe("https://demo.example/en/inbox?agentChat=closed");
  expect(frame(host).getAttribute("data-homepage-stage-live")).toBe("loading");
  advance(PRODUCT_STAGE_INTERVAL_MS * 3);
  expect(selectedLabel(host)).toContain("Inbox");
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
  expect(host.querySelector("iframe")?.getAttribute("src")).toBe("https://demo.example/en/routines?agentChat=closed");
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
  expect(host.querySelector("iframe")?.getAttribute("src")).toBe("https://demo.example/en/contacts?agentChat=closed");

  act(() => root?.unmount());
  document.body.replaceChildren();
  window.history.replaceState(null, "", "#pricing");
  const unrelated = render();

  expect(selectedLabel(unrelated)).toContain("Inbox");
  expect(unrelated.querySelector("iframe")).toBeNull();
  window.history.replaceState(null, "", "#");
});
