import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { highlightFocusTarget } from "../focus-target";

describe("highlightFocusTarget", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal("CSS", { escape: (value: string) => value });
    document.body.innerHTML = '<li data-focus-target="field:upper"></li>';
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("keeps a repeated highlight for its full duration", () => {
    const element = document.querySelector("li");
    highlightFocusTarget({ kind: "field", id: "upper" });
    vi.advanceTimersByTime(2000);
    highlightFocusTarget({ kind: "field", id: "upper" });
    vi.advanceTimersByTime(1000);
    expect(element?.hasAttribute("data-focus-highlight")).toBe(true);
    vi.advanceTimersByTime(1400);
    expect(element?.hasAttribute("data-focus-highlight")).toBe(false);
  });
});
