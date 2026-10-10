import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useOverlayFocusReturn } from "../use-overlay-focus-return";

type FocusReturn = ReturnType<typeof useOverlayFocusReturn>;

function FocusReturnHarness({
  open,
  opener,
  onReady,
}: {
  open: boolean;
  opener: HTMLElement;
  onReady: (handlers: FocusReturn) => void;
}) {
  onReady(useOverlayFocusReturn(open, opener));
  return null;
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  vi.unstubAllGlobals();
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function button() {
  const element = document.createElement("button");
  document.body.append(element);
  vi.spyOn(element, "getClientRects").mockReturnValue([new DOMRect(0, 0, 80, 30)] as unknown as DOMRectList);
  return element;
}

function fixture() {
  const opener = button();
  const inside = button();
  let handlers: FocusReturn | undefined;
  const render = (open: boolean, target = opener) => {
    act(() => {
      root.render(
        createElement(FocusReturnHarness, {
          open,
          opener: target,
          onReady: (value) => {
            handlers = value;
          },
        }),
      );
    });
  };
  const currentHandlers = () => {
    if (!handlers) throw new Error("Expected mounted focus-return handlers");
    return handlers;
  };
  const closeHandler = () => currentHandlers().onCloseAutoFocus;
  const close = () => {
    render(false);
    const event = new Event("closeAutoFocus", { cancelable: true });
    closeHandler()(event);
    expect(event.defaultPrevented).toBe(true);
  };
  render(true);
  currentHandlers().onOpenAutoFocus();
  inside.focus();
  return { opener, inside, render, close, closeHandler };
}

describe("overlay focus-return lifecycle", () => {
  it("returns focus immediately and recovers lost focus after the existing delay", () => {
    const f = fixture();
    f.close();
    expect(document.activeElement).toBe(f.opener);
    f.opener.blur();
    expect(document.activeElement).toBe(document.body);
    vi.advanceTimersByTime(49);
    expect(document.activeElement).toBe(document.body);
    vi.advanceTimersByTime(1);
    expect(document.activeElement).toBe(f.opener);
    f.opener.blur();
    vi.advanceTimersByTime(50);
    expect(document.activeElement).toBe(document.body);
  });

  it("keeps focus on a usable control chosen after the overlay closes", () => {
    const f = fixture();
    f.close();
    f.inside.focus();
    vi.advanceTimersByTime(50);
    expect(document.activeElement).toBe(f.inside);
  });

  it("ignores an old close return after reopening and retains the new opener", () => {
    const f = fixture();
    f.close();
    const nextOpener = button();
    f.render(true, nextOpener);
    f.opener.blur();
    vi.advanceTimersByTime(50);
    expect(document.activeElement).toBe(document.body);
    f.render(false, nextOpener);
    const event = new Event("closeAutoFocus", { cancelable: true });
    f.closeHandler()(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(nextOpener);
    nextOpener.blur();
    vi.advanceTimersByTime(50);
    expect(document.activeElement).toBe(nextOpener);
  });

  it("cancels a pending return when unmounted before the document is removed", () => {
    const f = fixture();
    const focus = vi.spyOn(f.opener, "focus");
    f.close();
    expect(focus).toHaveBeenCalledOnce();
    act(() => root.render(null));
    vi.stubGlobal("document", undefined);
    expect(() => vi.advanceTimersByTime(50)).not.toThrow();
    expect(focus).toHaveBeenCalledOnce();
  });

  it("prevents a late close notification from scheduling focus after unmount", () => {
    const f = fixture();
    f.render(false);
    const onClose = f.closeHandler();
    const focus = vi.spyOn(f.opener, "focus");
    act(() => root.render(null));
    const schedule = vi.spyOn(window, "setTimeout");
    const event = new Event("closeAutoFocus", { cancelable: true });
    onClose(event);
    expect(event.defaultPrevented).toBe(true);
    expect(focus).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
    vi.stubGlobal("document", undefined);
    expect(() => vi.advanceTimersByTime(50)).not.toThrow();
  });
});
