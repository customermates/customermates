import { act } from "react";
import { jsx } from "react/jsx-runtime";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MessagesScrollContainer } from "../messages-scroll-container";

class ResizeObserverMock {
  observe() {}
  disconnect() {}
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

beforeEach(() => {
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
});
