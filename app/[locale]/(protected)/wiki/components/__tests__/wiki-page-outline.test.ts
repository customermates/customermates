import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement, useRef } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { WikiPageOutline, wikiDocumentHeadings } from "../wiki-page-outline";

const document = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Overview" }] },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Products" }] },
    { type: "heading", attrs: { level: 2 }, content: [] },
    {
      type: "heading",
      attrs: { level: 3 },
      content: [
        { type: "text", text: "Support" },
        { type: "text", text: " process" },
      ],
    },
  ],
};

const roots: Root[] = [];
const containers: HTMLElement[] = [];
const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");

function OutlineHarness({ children = null }: { children?: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);

  return createElement("div", { ref: containerRef }, [
    createElement("div", { className: "tiptap", key: "document" }, [
      createElement("h1", { key: "overview" }, "Overview"),
      createElement("h2", { key: "products" }, "Products"),
      createElement("h2", { key: "empty" }),
      createElement("h3", { key: "support" }, "Support process"),
    ]),
    createElement(WikiPageOutline, { containerRef, document, key: "outline" }),
    children,
  ]);
}

async function mount(node: ReactNode) {
  const container = window.document.createElement("div");
  window.document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(node);
    await Promise.resolve();
  });
  return container;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
    writable: true,
  });
});

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  for (const container of containers.splice(0)) container.remove();
  vi.unstubAllGlobals();
  if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

describe("Wiki page outline", () => {
  it("derives nonempty H1, H2, and H3 entries in document order without storing metadata", () => {
    expect(wikiDocumentHeadings(document)).toEqual([
      { index: 0, level: 1, text: "Overview" },
      { index: 1, level: 2, text: "Products" },
      { index: 3, level: 3, text: "Support process" },
    ]);
  });

  it("stays hidden when the document has fewer than two nonempty headings", () => {
    const html = renderToStaticMarkup(
      createElement(WikiPageOutline, {
        containerRef: { current: null },
        document: {
          type: "doc",
          content: [{ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Only" }] }],
        },
      }),
    );

    expect(html).toBe("");
  });

  it("renders a 2xl-only hierarchy and scrolls the matching rendered heading smoothly", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })),
    );
    const container = await mount(createElement(OutlineHarness));
    const outline = container.querySelector('nav[aria-label="Wiki.onThisPage"]');
    const buttons = [...container.querySelectorAll<HTMLButtonElement>("nav button")];
    const headings = container.querySelectorAll<HTMLElement>(".tiptap h1, .tiptap h2, .tiptap h3");

    expect(outline?.className).toContain("hidden");
    expect(outline?.className).toContain("2xl:block");
    expect(buttons.map((button) => button.textContent)).toEqual(["Overview", "Products", "Support process"]);
    expect(buttons[0]?.className).not.toContain("pl-3");
    expect(buttons[1]?.className).toContain("pl-3");
    expect(buttons[2]?.className).toContain("pl-6");

    const scrollIntoView = vi.fn();
    if (headings[3]) headings[3].scrollIntoView = scrollIntoView;
    act(() => buttons[2]?.click());
    expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ behavior: "smooth", block: "start" });
  });

  it("disables smooth scrolling when reduced motion is preferred", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    const container = await mount(createElement(OutlineHarness));
    const firstHeading = container.querySelector<HTMLElement>(".tiptap h1");

    const scrollIntoView = vi.fn();
    if (firstHeading) firstHeading.scrollIntoView = scrollIntoView;
    act(() => container.querySelector<HTMLButtonElement>("nav button")?.click());
    expect(scrollIntoView).toHaveBeenCalledExactlyOnceWith({ behavior: "auto", block: "start" });
  });
});
