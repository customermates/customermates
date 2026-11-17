import type { ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const links = vi.hoisted(() => [] as Array<{ href: string; onClick?: (event: unknown) => void }>);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join("|")}` : key,
}));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({
    children,
    onClick,
    ...props
  }: {
    children?: ReactNode;
    onClick?: (event: unknown) => void;
    [key: string]: unknown;
  }) => {
    links.push({ href: String(props.href), onClick });
    return createElement("a", props, children);
  },
}));

import { WikiPageList } from "../wiki-page-list";

const GUIDE = "10000000-0000-4000-8000-000000000001";
const REFUNDS = "10000000-0000-4000-8000-000000000002";
const PRICING = "10000000-0000-4000-8000-000000000003";
const VOICE = "10000000-0000-4000-8000-000000000004";
const nodes = [
  { id: PRICING, title: "Pricing", kind: "knowledge" as const },
  { id: REFUNDS, title: "Refunds", kind: "procedure" as const },
  { id: GUIDE, title: "Operating Guide", kind: "guide" as const },
  { id: VOICE, title: "Voice", kind: "knowledge" as const },
];
const all = new Set(nodes.map((node) => node.id));

function render(props: Partial<Parameters<typeof WikiPageList>[0]> = {}) {
  links.length = 0;
  const onSelect = vi.fn();
  const html = renderToStaticMarkup(
    createElement(WikiPageList, { nodes, visible: all, truncated: false, onSelect, ...props }),
  );
  const container = document.createElement("div");
  container.innerHTML = html;
  return { container, onSelect };
}

describe("Knowledge Base page list for narrow screens", () => {
  it("groups the pages by kind, guide first, with the number of pages in each group", () => {
    const { container } = render();

    expect([...container.querySelectorAll("h2")].map((heading) => heading.textContent)).toEqual([
      "Wiki.kind.guide · 1",
      "Wiki.graph.filter.procedure · 1",
      "Wiki.graph.filter.knowledge · 2",
    ]);
    expect([...container.querySelectorAll("a")].map((link) => link.textContent)).toEqual([
      "Operating Guide",
      "Refunds",
      "Pricing",
      "Voice",
    ]);
    expect(container.querySelector("nav")?.getAttribute("aria-label")).toBe("Wiki.pagesLabel");
  });

  it("links each row to its page, so it also opens in a new tab", () => {
    const { container } = render();

    expect(container.querySelector("a")?.getAttribute("href")).toBe(`/wiki?page=${GUIDE}`);
    expect(container.querySelector("a span.border-foreground.bg-background")).not.toBeNull();
  });

  it("opens the page sheet on a plain click and leaves a modified click to the browser", () => {
    const { onSelect } = render();
    const refunds = links.find((link) => link.href.endsWith(REFUNDS));
    const plain = { button: 0, preventDefault: vi.fn() };
    const modified = { button: 0, metaKey: true, preventDefault: vi.fn() };
    const middle = { button: 1, preventDefault: vi.fn() };

    refunds?.onClick?.(plain);
    refunds?.onClick?.(modified);
    refunds?.onClick?.(middle);

    expect(onSelect).toHaveBeenCalledExactlyOnceWith(REFUNDS);
    expect(plain.preventDefault).toHaveBeenCalledOnce();
    expect(modified.preventDefault).not.toHaveBeenCalled();
    expect(middle.preventDefault).not.toHaveBeenCalled();
  });

  it("shows only the pages a search leaves, and says so when none is left", () => {
    const some = render({ visible: new Set([PRICING]) }).container;
    expect([...some.querySelectorAll("a")].map((link) => link.textContent)).toEqual(["Pricing"]);
    expect([...some.querySelectorAll("h2")].map((heading) => heading.textContent)).toEqual([
      "Wiki.graph.filter.knowledge · 1",
    ]);

    const none = render({ visible: new Set() }).container;
    expect(none.querySelectorAll("a")).toHaveLength(0);
    expect(none.textContent).toContain("Wiki.graph.noMatches");
  });

  it("says when the list shows only part of a large Knowledge Base", () => {
    expect(render({ truncated: true }).container.textContent).toContain("Wiki.graph.truncated:4");
    expect(render().container.textContent).not.toContain("Wiki.graph.truncated");
  });
});
