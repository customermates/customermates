import type { Root } from "react-dom/client";

import { act, createElement, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useIsTruncated } from "../use-is-truncated";

function TruncationProbe() {
  const ref = useRef<HTMLSpanElement | null>(null);
  const isTruncated = useIsTruncated(ref, "Long value");

  return createElement("span", { ref, "data-is-truncated": isTruncated }, "Long value");
}

describe("useIsTruncated", () => {
  let root: Root | undefined;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = undefined;
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("remeasures after the first painted frame when ResizeObserver is unavailable", () => {
    let clientWidth = 120;
    let scrollWidth = 120;
    let frameCallback: FrameRequestCallback | undefined;

    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => clientWidth);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(() => scrollWidth);
    vi.stubGlobal("ResizeObserver", undefined);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        frameCallback = callback;
        return 1;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(createElement(TruncationProbe)));

    expect(container.querySelector("[data-is-truncated]")?.getAttribute("data-is-truncated")).toBe("false");

    clientWidth = 80;
    scrollWidth = 160;
    act(() => frameCallback?.(performance.now()));

    expect(container.querySelector("[data-is-truncated]")?.getAttribute("data-is-truncated")).toBe("true");
  });

  it("falls back to a timer when painted-frame APIs are unavailable", () => {
    vi.useFakeTimers();
    let clientWidth = 120;
    let scrollWidth = 120;

    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => clientWidth);
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(() => scrollWidth);
    vi.stubGlobal("ResizeObserver", undefined);
    vi.stubGlobal("requestAnimationFrame", undefined);

    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(createElement(TruncationProbe)));

    clientWidth = 80;
    scrollWidth = 160;
    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(container.querySelector("[data-is-truncated]")?.getAttribute("data-is-truncated")).toBe("true");
  });
});
