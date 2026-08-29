import type { AnchorHTMLAttributes, ReactNode } from "react";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
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
    columns: [
      {
        links: [{ href: "/features/self-hosted", title: "Self-hosted" }],
        title: "Platform",
      },
    ],
    id: "product",
    title: "Product",
  },
  {
    columns: [{ links: [{ href: "/for/agencies", title: "Agencies" }], title: "Teams" }],
    id: "solutions",
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
  it("ships the primary navigation and pricing destination in server markup", () => {
    const markup = renderToStaticMarkup(menu());

    expect(markup).toContain("Product");
    expect(markup).toContain("Solutions");
    expect(markup).toContain('href="/pricing"');
    expect(markup.match(/aria-expanded="false"/gu)).toHaveLength(groups.length);
  });

  it("opens one panel at a time and supports focus, Escape, outside close, and link close", async () => {
    const onNavigate = vi.fn();
    act(() => root?.render(menu(onNavigate)));

    const buttons = [...(container?.querySelectorAll("button") ?? [])];
    const [product, solutions] = buttons;
    if (!product || !solutions) throw new Error("navigation triggers did not render");

    act(() => product.click());
    expect(product.getAttribute("aria-expanded")).toBe("true");
    expect(solutions.getAttribute("aria-expanded")).toBe("false");

    act(() => solutions.click());
    expect(product.getAttribute("aria-expanded")).toBe("false");
    expect(solutions.getAttribute("aria-expanded")).toBe("true");

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
      await Promise.resolve();
    });
    expect(solutions.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(solutions);

    void act(() => product.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })));
    expect(product.getAttribute("aria-expanded")).toBe("true");

    void act(() => document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    expect(product.getAttribute("aria-expanded")).toBe("false");

    act(() => solutions.click());
    const link = document.querySelector<HTMLAnchorElement>('a[href="/for/agencies"]');
    if (!link) throw new Error("navigation link did not render");
    link.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });
    act(() => link.click());
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(solutions.getAttribute("aria-expanded")).toBe("false");
  });
});
