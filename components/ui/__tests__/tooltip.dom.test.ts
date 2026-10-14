import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, fitWrappedTooltip } from "../tooltip";

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

  it("closes without an exit animation and keeps no motion under reduced motion", () => {
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
            createElement(TooltipTrigger, null, "Edit field"),
            createElement(TooltipContent, null, "Edit field"),
          ),
        ),
      );
    });

    const classes = document.querySelector('[data-slot="tooltip-content"]')?.className ?? "";
    expect(classes).not.toMatch(/animate-out|fade-out|zoom-out/);
    expect(classes).toContain("motion-reduce:animate-none");
    expect(classes.split(" ")).not.toContain("light");
    expect(classes).toContain("border-border");
    expect(classes).toContain("bg-tooltip");
    expect(classes).toContain("text-tooltip-foreground");
    act(() => root.unmount());
  });

  it("opens only the innermost tooltip when triggers are nested", async () => {
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
            null,
            createElement(
              TooltipTrigger,
              { asChild: true },
              createElement(
                "span",
                null,
                "Assigned to ",
                createElement(
                  Tooltip,
                  null,
                  createElement(TooltipTrigger, { asChild: true }, createElement("span", { id: "avatar" }, "BA")),
                  createElement(TooltipContent, null, "Browser Administrator"),
                ),
              ),
            ),
            createElement(TooltipContent, null, "Assigned to"),
          ),
        ),
      );
    });

    await act(async () => {
      document.getElementById("avatar")?.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(
      [...document.querySelectorAll('[data-slot="tooltip-content"]')].map((content) => content.firstChild?.textContent),
    ).toEqual(["Browser Administrator"]);
    act(() => root.unmount());
  });

  it("opens the outer tooltip when the nested trigger has nothing to show", async () => {
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
            null,
            createElement(
              TooltipTrigger,
              { asChild: true },
              createElement(
                "span",
                null,
                createElement(
                  Tooltip,
                  null,
                  createElement(TooltipTrigger, { asChild: true }, createElement("span", { id: "chip" }, "Unverified")),
                ),
              ),
            ),
            createElement(TooltipContent, null, "Not verified yet"),
          ),
        ),
      );
    });

    await act(async () => {
      document.getElementById("chip")?.dispatchEvent(new MouseEvent("pointermove", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(
      [...document.querySelectorAll('[data-slot="tooltip-content"]')].map((content) => content.firstChild?.textContent),
    ).toEqual(["Not verified yet"]);
    act(() => root.unmount());
  });
});

describe("fitWrappedTooltip", () => {
  function rect(left: number, top: number, width: number, height = 16) {
    return new DOMRect(left, top, width, height);
  }

  function tooltip(lines: DOMRect[], textHeight: number) {
    const content = document.createElement("div");
    content.style.lineHeight = "16px";
    content.style.paddingLeft = "10px";
    content.style.paddingRight = "10px";
    const text = document.createElement("span");
    text.textContent = "Calculated: largest Discount % among linked Line items";
    content.append(text);
    document.body.append(content);
    vi.spyOn(content, "getBoundingClientRect").mockReturnValue(rect(0, 0, 320, textHeight));
    vi.spyOn(text, "getBoundingClientRect").mockReturnValue(rect(10, 0, 300, textHeight));
    Object.assign(Range.prototype, { getClientRects: () => lines });
    return content;
  }

  it("shrinks a wrapped tooltip to its longest line plus padding", () => {
    const content = tooltip([rect(10, 0, 120), rect(130, 0, 60), rect(10, 16, 170)], 32);
    fitWrappedTooltip(content, content.firstElementChild as HTMLElement);
    const width = Number.parseFloat(content.style.width);
    expect(Math.abs(width - (180 + 20))).toBeLessThanOrEqual(8);
  });

  it("leaves a single-line tooltip at its natural width", () => {
    const content = tooltip([rect(10, 0, 200)], 16);
    fitWrappedTooltip(content, content.firstElementChild as HTMLElement);
    expect(content.style.width).toBe("");
  });
});
