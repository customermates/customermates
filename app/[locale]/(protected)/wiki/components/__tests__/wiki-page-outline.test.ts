import type { ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { WIKI_HEADING_ID_PREFIX, WikiPageOutline, wikiDocumentHeadings } from "../wiki-page-outline";

const document = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Overview" }],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Products" }],
    },
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

class ObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

function OutlineHarness({ children = null }: { children?: ReactNode }) {
  return createElement("div", null, [
    createElement("div", { className: "tiptap", key: "document" }, [
      createElement("h1", { id: `${WIKI_HEADING_ID_PREFIX}-0`, key: "overview" }, "Overview"),
      createElement("h2", { id: `${WIKI_HEADING_ID_PREFIX}-1`, key: "products" }, "Products"),
      createElement("h2", { id: `${WIKI_HEADING_ID_PREFIX}-2`, key: "empty" }),
      createElement("h3", { id: `${WIKI_HEADING_ID_PREFIX}-3`, key: "support" }, "Support process"),
    ]),
    createElement(WikiPageOutline, { document, key: "outline" }),
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
  vi.stubGlobal("IntersectionObserver", ObserverStub);
  vi.stubGlobal("ResizeObserver", ObserverStub);
});

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  for (const container of containers.splice(0)) container.remove();
  vi.unstubAllGlobals();
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
        document: {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 1 },
              content: [{ type: "text", text: "Only" }],
            },
          ],
        },
      }),
    );

    expect(html).toBe("");
  });

  it("waits for the rendered headings before it mounts the table of contents", () => {
    expect(renderToStaticMarkup(createElement(WikiPageOutline, { document }))).toBe("");
  });

  it("renders the shared table of contents with anchors to the rendered headings inside the wiki container", async () => {
    const container = await mount(createElement(OutlineHarness));
    const outline = container.querySelector('nav[aria-label="Wiki.onThisPage"]');
    const links = [...container.querySelectorAll<HTMLAnchorElement>("nav a")];

    expect(outline?.className).toContain("sticky");
    expect(outline?.className).toContain("hidden");
    expect(outline?.className).toContain("@min-[58rem]/wiki:flex");
    expect(links.map((link) => link.textContent)).toEqual(["Overview", "Products", "Support process"]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "#wiki-heading-0",
      "#wiki-heading-1",
      "#wiki-heading-3",
    ]);
    expect(links.map((link) => link.style.paddingInlineStart)).toEqual(["14px", "26px", "36px"]);
    for (const link of links) expect(container.querySelector(link.getAttribute("href") ?? "")).not.toBeNull();
  });
});
