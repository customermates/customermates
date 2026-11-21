import type { Root } from "react-dom/client";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MateOrb } from "../mate-orb";

let container: HTMLDivElement;
let root: Root;

function render(props: Parameters<typeof MateOrb>[0] = {}) {
  act(() => root.render(createElement(MateOrb, props)));
  return container.querySelector<HTMLElement>("[data-mate-orb]");
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("MateOrb", () => {
  it("draws the ring, the orb and two eyes and stays decorative without a label", () => {
    const orb = render();

    expect(orb?.getAttribute("aria-hidden")).toBe("true");
    expect(orb?.getAttribute("role")).toBeNull();
    expect(orb?.querySelectorAll(".mate-orb-ring")).toHaveLength(1);
    expect(orb?.querySelectorAll(".mate-orb-body")).toHaveLength(1);
    expect(orb?.querySelectorAll(".mate-orb-eye")).toHaveLength(2);
    expect(orb?.className).toContain("size-4");
  });

  it("marks the orb as working only while Mate works and names it when labelled", () => {
    expect(render()?.hasAttribute("data-working")).toBe(false);

    const working = render({ working: true, label: "Mate is working", className: "size-10" });
    expect(working?.hasAttribute("data-working")).toBe(true);
    expect(working?.getAttribute("role")).toBe("img");
    expect(working?.getAttribute("aria-label")).toBe("Mate is working");
    expect(working?.getAttribute("aria-hidden")).toBeNull();
    expect(working?.className).toContain("size-10");
  });

  it("rotates the ring only while working or on the Ask Mate hover, never with reduced motion", () => {
    const styles = readFileSync(join(process.cwd(), "styles", "globals.css"), "utf8");

    expect(styles).toContain("[data-mate-orb][data-working] .mate-orb-ring");
    expect(styles).toContain("[data-mate-hover]:hover [data-mate-orb] .mate-orb-ring");
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\[data-mate-orb\] \.mate-orb-ring \{\s*animation: none !important;/,
    );
    expect(styles).toContain("--mate-ring-teal: #0f9488");
    expect(styles).toContain("--mate-ring-blue: #3b82f6");
    expect(styles).toContain("--mate-ring-amber: #f59e0b");
  });
});
