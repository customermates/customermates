import type { AnchorHTMLAttributes, ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { Boxes, UsersRound } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/shared/app-link", () => ({
  AppLink: ({
    appearance: _appearance,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    appearance?: string;
    children?: ReactNode;
  }) => createElement("a", props, children),
}));

import { PublicNavbarMenu, type PublicNavGroup } from "../public-navbar-menu";

const groups: PublicNavGroup[] = [
  {
    description: "Understand the product.",
    featured: { href: "/features", title: "Features" },
    icon: Boxes,
    sections: [
      {
        links: [{ href: "/features/self-hosted", title: "Self-hosted" }],
        title: "Platform",
      },
    ],
    id: "product",
    title: "Product",
  },
  {
    description: "Find a solution.",
    featured: { href: "/for", title: "All solutions" },
    id: "solutions",
    icon: UsersRound,
    sections: [{ links: [{ href: "/for/agencies", title: "Agencies" }], title: "Teams" }],
    title: "Solutions",
  },
];

let container: HTMLDivElement | undefined;
let root: Root | undefined;

function menu(onNavigate = vi.fn()) {
  return createElement(PublicNavbarMenu, {
    ariaLabel: "Primary navigation",
    groups,
    onNavigate,
    pathname: "/",
    pricingLabel: "Pricing",
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.clearAllMocks();
});

describe("PublicNavbarMenu", () => {
  it("ships every curated destination in server markup", () => {
    const markup = renderToStaticMarkup(menu());

    expect(markup).toContain("Product");
    expect(markup).toContain("Solutions");
    expect(markup).toContain('href="/features"');
    expect(markup).toContain('href="/features/self-hosted"');
    expect(markup).toContain('href="/for"');
    expect(markup).toContain('href="/for/agencies"');
    expect(markup).toContain('href="/pricing"');
    expect(markup.match(/aria-expanded="false"/gu)).toHaveLength(groups.length);
  });

  it("opens one panel at a time, restores focus on Escape, and closes on navigation", async () => {
    const onNavigate = vi.fn();
    act(() => root?.render(menu(onNavigate)));

    const buttons = [...(container?.querySelectorAll("button") ?? [])];
    const [product, solutions] = buttons;
    if (!product || !solutions) throw new Error("navigation triggers did not render");

    act(() => product.click());
    expect(product.getAttribute("aria-expanded")).toBe("true");
    expect(solutions.getAttribute("aria-expanded")).toBe("false");

    act(() => product.click());
    expect(product.getAttribute("aria-expanded")).toBe("false");

    act(() => product.click());

    act(() => solutions.click());
    expect(product.getAttribute("aria-expanded")).toBe("false");
    expect(solutions.getAttribute("aria-expanded")).toBe("true");

    const link = document.querySelector<HTMLAnchorElement>('a[href="/for/agencies"]');
    if (!link) throw new Error("navigation link did not render");
    link.focus();
    await act(async () => {
      link.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
      await Promise.resolve();
    });
    expect(solutions.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(solutions);

    act(() => solutions.click());
    link.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });
    act(() => link.click());
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(solutions.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens and closes the focused trigger with Enter and Space", () => {
    act(() => root?.render(menu()));

    const product = container?.querySelector<HTMLButtonElement>('[data-public-nav-trigger="product"]');
    if (!product) throw new Error("product navigation trigger did not render");

    act(() => {
      product.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    });
    expect(product.getAttribute("aria-expanded")).toBe("true");

    act(() => {
      product.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: " " }));
    });
    expect(product.getAttribute("aria-expanded")).toBe("false");
  });

  it("marks the active destination as the current page", () => {
    const markup = renderToStaticMarkup(
      createElement(PublicNavbarMenu, {
        ariaLabel: "Primary navigation",
        groups,
        onNavigate: vi.fn(),
        pathname: "/features/self-hosted",
        pricingLabel: "Pricing",
      }),
    );

    expect(markup).toMatch(/<a(?=[^>]*aria-current="page")(?=[^>]*href="\/features\/self-hosted")[^>]*>/u);
    expect(markup).not.toMatch(/<a(?=[^>]*aria-current="page")(?=[^>]*href="\/features")[^>]*>/u);
    expect(markup.match(/aria-current="page"/gu)).toHaveLength(1);
  });
});
