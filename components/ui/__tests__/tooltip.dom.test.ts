import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../tooltip";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

afterEach(() => {
  document.body.innerHTML = "";
});

describe("TooltipContent", () => {
  it("never takes pointer events from the control it describes", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        createElement(
          TooltipProvider,
          null,
          createElement(
            Tooltip,
            { open: true },
            createElement(TooltipTrigger, { asChild: true }, createElement("a", { href: "/en/inbox" }, "Go to inbox")),
            createElement(TooltipContent, null, "Go to inbox"),
          ),
        ),
      );
    });

    const content = document.querySelector('[data-slot="tooltip-content"]');
    expect(content).not.toBeNull();
    expect(content?.classList.contains("pointer-events-none")).toBe(true);
    for (const element of content?.querySelectorAll("*") ?? [])
      expect(element.classList.contains("pointer-events-auto")).toBe(false);
    act(() => root.unmount());
  });
});
