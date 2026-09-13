import { act, createRef } from "react";
import { jsx } from "react/jsx-runtime";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MessagesScrollContainer } from "../messages-scroll-container";

const resizeCallbacks = new Map<Element, Set<() => void>>();

class ResizeObserverMock {
  private readonly observed = new Set<Element>();

  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(target: Element) {
    this.observed.add(target);
    const callbacks = resizeCallbacks.get(target) ?? new Set<() => void>();
    callbacks.add(() => this.callback([], this as unknown as ResizeObserver));
    resizeCallbacks.set(target, callbacks);
  }

  disconnect() {
    for (const target of this.observed) resizeCallbacks.delete(target);
    this.observed.clear();
  }
}

let container: HTMLDivElement;
let root: Root;

function render(latestItemKey: string, content: string) {
  act(() => {
    root.render(
      jsx(MessagesScrollContainer, {
        jumpToLatestLabel: "Jump to latest",
        latestItemKey,
        scrollKey: "conversation-1",
        children: jsx("div", { children: content }),
      }),
    );
  });
}

function setScrollMetrics(element: HTMLElement, metrics: { height: number; top: number; viewport: number }) {
  let scrollHeight = metrics.height;
  Object.defineProperties(element, {
    clientHeight: { configurable: true, get: () => metrics.viewport },
    scrollHeight: { configurable: true, get: () => scrollHeight },
    scrollTop: { configurable: true, writable: true, value: metrics.top },
  });

  return (height: number) => {
    scrollHeight = height;
  };
}

function triggerResize(element: Element) {
  act(() => {
    for (const callback of resizeCallbacks.get(element) ?? []) callback();
  });
}

beforeEach(() => {
  resizeCallbacks.clear();
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("MessagesScrollContainer latest-item following", () => {
  it("follows a newly rendered approval even when no resize callback arrives", () => {
    render("assistant-1", "Assistant response");
    const region = container.querySelector<HTMLElement>('[role="region"]');
    if (!region) throw new Error("expected scroll region");
    const setHeight = setScrollMetrics(region, { height: 500, top: 300, viewport: 200 });

    setHeight(760);
    render("approval-1", "Approval card");

    expect(region.scrollTop).toBe(760);
  });

  it("preserves position when the user has scrolled away from the latest item", () => {
    render("assistant-1", "Assistant response");
    const region = container.querySelector<HTMLElement>('[role="region"]');
    if (!region) throw new Error("expected scroll region");
    const setHeight = setScrollMetrics(region, { height: 700, top: 500, viewport: 200 });

    region.scrollTop = 100;
    act(() => {
      region.dispatchEvent(new Event("scroll"));
    });
    setHeight(900);
    render("approval-1", "Approval card");

    expect(region.scrollTop).toBe(100);
    expect(container.querySelector('[aria-label="Jump to latest"]')).not.toBeNull();
  });

  it("delegates following and scroll tracking to an external scroll owner", () => {
    const scrollContainerRef = createRef<HTMLDivElement>();
    const renderExternal = (latestItemKey: string, content: string) => {
      act(() => {
        root.render(
          jsx("div", {
            ref: scrollContainerRef,
            "aria-label": "Run details",
            role: "region",
            children: jsx(MessagesScrollContainer, {
              jumpToLatestLabel: "Jump to latest",
              latestItemKey,
              scrollContainerRef,
              scrollKey: "conversation-1",
              children: jsx("div", { children: content }),
            }),
          }),
        );
      });
    };

    renderExternal("assistant-1", "Assistant response");
    const region = scrollContainerRef.current;
    if (!region) throw new Error("expected external scroll region");
    const setHeight = setScrollMetrics(region, { height: 700, top: 500, viewport: 200 });

    region.scrollTop = 100;
    act(() => {
      region.dispatchEvent(new Event("scroll"));
    });
    setHeight(900);
    renderExternal("approval-1", "Approval card");

    expect(region.scrollTop).toBe(100);
    expect(container.querySelectorAll('[role="region"]')).toHaveLength(1);
    expect(container.querySelector('[aria-label="Jump to latest"]')).not.toBeNull();
  });

  it("re-bottoms a sticky external scroll owner when its viewport shrinks", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    const scrollContainerRef = createRef<HTMLDivElement>();

    act(() => {
      root.render(
        jsx("div", {
          ref: scrollContainerRef,
          children: jsx(MessagesScrollContainer, {
            latestItemKey: "assistant-1",
            scrollContainerRef,
            scrollKey: "conversation-1",
            children: jsx("div", { children: "Assistant response" }),
          }),
        }),
      );
    });

    const region = scrollContainerRef.current;
    if (!region) throw new Error("expected external scroll region");
    let viewport = 200;
    setScrollMetrics(region, { height: 700, top: 500, viewport });
    Object.defineProperty(region, "clientHeight", { configurable: true, get: () => viewport });

    region.dispatchEvent(new Event("scroll"));
    viewport = 400;
    region.scrollTop = 300;
    triggerResize(region);
    viewport = 200;
    triggerResize(region);

    expect(region.scrollTop).toBe(700);
  });

  it("offsets the external jump control by the measured sticky footer height", () => {
    const scrollContainerRef = createRef<HTMLDivElement>();
    const scrollFooterRef = createRef<HTMLDivElement>();

    act(() => {
      root.render(
        jsx("div", {
          ref: scrollContainerRef,
          children: [
            jsx(
              MessagesScrollContainer,
              {
                jumpToLatestLabel: "Jump to latest",
                scrollContainerRef,
                scrollFooterRef,
                scrollKey: "conversation-1",
                children: jsx("div", { children: "Assistant response" }),
              },
              "messages",
            ),
            jsx("div", { ref: scrollFooterRef }, "footer"),
          ],
        }),
      );
    });

    const region = scrollContainerRef.current;
    const footer = scrollFooterRef.current;
    if (!region || !footer) throw new Error("expected external scroll elements");
    setScrollMetrics(region, { height: 700, top: 100, viewport: 200 });
    vi.spyOn(footer, "getBoundingClientRect").mockReturnValue({ height: 74 } as DOMRect);

    act(() => {
      region.dispatchEvent(new Event("scroll"));
    });
    triggerResize(footer);

    const jumpButton = container.querySelector<HTMLElement>('[aria-label="Jump to latest"]');
    expect(jumpButton?.parentElement?.style.top).toBe("calc(100% + (-1 * (74px + 3rem)))");
  });
});
