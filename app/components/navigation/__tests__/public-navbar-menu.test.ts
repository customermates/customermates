import type { AnchorHTMLAttributes, MouseEvent as ReactMouseEvent, ReactNode } from "react";
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
    onClick,
    onNavigate,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    appearance?: string;
    children?: ReactNode;
    onNavigate?: () => void;
  }) =>
    createElement(
      "a",
      {
        ...props,
        onClick: (event: ReactMouseEvent<HTMLAnchorElement>) => {
          onClick?.(event);
          if (event.defaultPrevented) return;
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            event.preventDefault();
            return;
          }
          onNavigate?.();
          event.preventDefault();
        },
      },
      children,
    ),
}));

import {
  isPrimaryPublicNavLink,
  PublicNavbarMenu,
  resolveActivePublicNavGroup,
  type PublicNavGroup,
} from "../public-navbar-menu";

const groups: PublicNavGroup[] = [
  {
    activeHref: "/features",
    columns: 2,
    icon: Boxes,
    links: [
      { href: "/features/self-hosted", title: "Self-hosted" },
      { href: "/features/all", title: "All features" },
    ],
    id: "product",
    title: "Product",
  },
  {
    activeHref: "/for",
    columns: 2,
    id: "solutions",
    icon: UsersRound,
    links: [
      { href: "/for/agencies", title: "Agencies" },
      { href: "/for", title: "All solutions" },
    ],
    title: "Solutions",
  },
];

let container: HTMLDivElement | undefined;
let root: Root | undefined;

function menu(onNavigate = vi.fn()) {
  return createElement(PublicNavbarMenu, {
    ariaLabel: "Primary navigation",
    docsLabel: "Documentation",
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
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("PublicNavbarMenu", () => {
  it("ships every curated destination in server markup", () => {
    const markup = renderToStaticMarkup(menu());

    expect(markup).toContain("Product");
    expect(markup).toContain("Solutions");
    expect(markup).toContain('href="/features/self-hosted"');
    expect(markup).toContain('href="/features/all"');
    expect(markup).not.toMatch(/href="\/features"(?:\s|>)/u);
    expect(markup).toContain('href="/for"');
    expect(markup).toContain('href="/for/agencies"');
    expect(markup).toContain('href="/pricing"');
    expect(markup).toContain('href="/docs"');
    expect(markup.match(/aria-expanded="false"/gu)).toHaveLength(groups.length);
    expect(markup).not.toContain("Platform");
    expect(markup).not.toContain("Teams");
    expect(markup).not.toContain("Understand the product");
    expect(markup).not.toContain("Find a solution");
    expect(markup).not.toContain("<section");
    expect(markup).not.toContain("<footer");
  });

  it("opens one panel at a time, restores focus on Escape, and closes on navigation", async () => {
    const onNavigate = vi.fn();
    act(() => root?.render(menu(onNavigate)));

    const buttons = [...(container?.querySelectorAll("button") ?? [])];
    const [product, solutions] = buttons;
    if (!product || !solutions) throw new Error("navigation triggers did not render");

    act(() => {
      product.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    });
    expect(product.getAttribute("aria-expanded")).toBe("true");
    expect(solutions.getAttribute("aria-expanded")).toBe("false");

    act(() => {
      product.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    });
    expect(product.getAttribute("aria-expanded")).toBe("true");

    act(() => {
      solutions.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    });
    expect(product.getAttribute("aria-expanded")).toBe("false");
    expect(solutions.getAttribute("aria-expanded")).toBe("true");

    const link = container?.querySelector<HTMLAnchorElement>('a[href="/for/agencies"]');
    if (!link) throw new Error("navigation link did not render");
    link.focus();
    await act(async () => {
      link.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
      await Promise.resolve();
    });
    expect(solutions.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(solutions);

    act(() => solutions.click());
    const reopenedLink = container?.querySelector<HTMLAnchorElement>('a[href="/for/agencies"]');
    if (!reopenedLink) throw new Error("reopened navigation link did not render");

    act(() => {
      reopenedLink.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true }));
    });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(solutions.getAttribute("aria-expanded")).toBe("true");

    reopenedLink.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });
    act(() => reopenedLink.click());
    expect(onNavigate).not.toHaveBeenCalled();
    expect(solutions.getAttribute("aria-expanded")).toBe("true");

    act(() => reopenedLink.click());
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(solutions.getAttribute("aria-expanded")).toBe("false");
  });

  it("toggles an expanded trigger for zero-detail assistive activation", () => {
    act(() => root?.render(menu()));

    const product = container?.querySelector<HTMLButtonElement>('[data-public-nav-trigger="product"]');
    if (!product) throw new Error("product navigation trigger did not render");
    product.focus();

    act(() => product.click());
    expect(product.getAttribute("aria-expanded")).toBe("true");

    act(() => product.click());
    expect(product.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(product);
  });

  it("unmounts the closed interactive layer and dismisses the open menu from outside", async () => {
    act(() => root?.render(menu()));

    const product = container?.querySelector<HTMLButtonElement>('[data-public-nav-trigger="product"]');
    if (!product) throw new Error("navigation fixtures did not render");
    expect(container?.querySelector('[data-slot="popover-content"]')).toBeNull();

    act(() => product.click());
    const productLink = container?.querySelector<HTMLAnchorElement>('a[href="/features/self-hosted"]');
    const solutionsLink = container?.querySelector<HTMLAnchorElement>('a[href="/for/agencies"]');
    const content = container?.querySelector<HTMLElement>('[data-slot="popover-content"]');
    const surface = container?.querySelector<HTMLElement>('[data-public-nav-surface="product"]');
    const grid = surface?.querySelector("ul");
    if (!productLink || !solutionsLink || !content || !surface || !grid)
      throw new Error("open navigation links did not render");
    expect(product.getAttribute("aria-expanded")).toBe("true");
    expect(content.className).toContain("overflow-y-auto");
    expect(content.className).not.toContain("overflow-hidden");
    expect(surface.classList.contains("bg-popover")).toBe(true);
    expect(surface.classList.contains("border-border")).toBe(true);
    expect(grid.classList.contains("bg-border")).toBe(true);
    expect(grid.classList.contains("border-sidebar")).toBe(false);
    expect(grid.classList.contains("bg-sidebar")).toBe(false);
    expect(productLink.getAttribute("tabindex")).toBeNull();
    expect(solutionsLink.tabIndex).toBe(-1);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    act(() => {
      document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    });
    expect(product.getAttribute("aria-expanded")).toBe("false");
    expect(container?.querySelector('[data-slot="popover-content"]')).toBeNull();
  });

  it("moves Tab into an expanded panel and returns focus with Shift+Tab", () => {
    act(() => root?.render(menu()));

    const product = container?.querySelector<HTMLButtonElement>('[data-public-nav-trigger="product"]');
    if (!product) throw new Error("product navigation trigger did not render");

    product.focus();
    act(() => {
      product.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    });
    const firstLink = container?.querySelector<HTMLAnchorElement>('a[href="/features/self-hosted"]');
    if (!firstLink) throw new Error("first product navigation link did not render");
    expect(product.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(product);

    act(() => {
      product.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Tab",
        }),
      );
    });
    expect(document.activeElement).toBe(firstLink);

    const secondLink = container?.querySelector<HTMLAnchorElement>('a[href="/features/all"]');
    if (!secondLink) throw new Error("second product navigation link did not render");
    act(() => {
      firstLink.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Tab",
        }),
      );
    });
    expect(document.activeElement).toBe(secondLink);

    act(() => {
      secondLink.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Tab",
          shiftKey: true,
        }),
      );
    });
    expect(document.activeElement).toBe(firstLink);

    act(() => {
      firstLink.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Tab",
          shiftKey: true,
        }),
      );
    });
    expect(product.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(product);
    expect(container?.querySelector('[data-slot="popover-content"]')).toBeNull();
  });

  it("moves Tab from the last panel link to the next top-level destination", () => {
    act(() => root?.render(menu()));

    const product = container?.querySelector<HTMLButtonElement>('[data-public-nav-trigger="product"]');
    const solutions = container?.querySelector<HTMLButtonElement>('[data-public-nav-trigger="solutions"]');
    if (!product || !solutions) throw new Error("navigation triggers did not render");
    product.focus();
    act(() => {
      product.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: " " }));
    });

    const lastLink = container?.querySelector<HTMLAnchorElement>('a[href="/features/all"]');
    if (!lastLink) throw new Error("last product navigation link did not render");
    lastLink.focus();
    const tabEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Tab",
    });
    act(() => {
      lastLink.dispatchEvent(tabEvent);
    });
    expect(tabEvent.defaultPrevented).toBe(true);
    expect(product.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(solutions);
  });

  it("does not replace a keyboard-focused panel on hover but lets click switch and reset scroll", () => {
    act(() => root?.render(menu()));

    const product = container?.querySelector<HTMLButtonElement>('[data-public-nav-trigger="product"]');
    const solutions = container?.querySelector<HTMLButtonElement>('[data-public-nav-trigger="solutions"]');
    const solutionsItem = solutions?.closest("li");
    if (!product || !solutions || !solutionsItem) throw new Error("navigation triggers did not render");

    product.focus();
    act(() => {
      product.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    });
    act(() => {
      product.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab" }));
    });
    const firstLink = container?.querySelector<HTMLAnchorElement>('a[href="/features/self-hosted"]');
    const content = container?.querySelector<HTMLElement>('[data-slot="popover-content"]');
    if (!firstLink || !content) throw new Error("open product navigation panel did not render");
    content.scrollTop = 72;

    act(() => {
      solutionsItem.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body }));
    });
    expect(product.getAttribute("aria-expanded")).toBe("true");
    expect(solutions.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(firstLink);
    expect(content.scrollTop).toBe(72);

    act(() => solutions.click());
    expect(product.getAttribute("aria-expanded")).toBe("false");
    expect(solutions.getAttribute("aria-expanded")).toBe("true");
    expect(content.scrollTop).toBe(0);
  });

  it("allows hover switching after a pointer click focuses a trigger", () => {
    act(() => root?.render(menu()));

    const product = container?.querySelector<HTMLButtonElement>('[data-public-nav-trigger="product"]');
    const solutions = container?.querySelector<HTMLButtonElement>('[data-public-nav-trigger="solutions"]');
    const solutionsItem = solutions?.closest("li");
    if (!product || !solutions || !solutionsItem) throw new Error("navigation triggers did not render");

    product.focus();
    act(() => {
      product.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
      product.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    });
    expect(product.getAttribute("aria-expanded")).toBe("true");

    act(() => {
      solutionsItem.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, relatedTarget: document.body }));
    });
    expect(product.getAttribute("aria-expanded")).toBe("false");
    expect(solutions.getAttribute("aria-expanded")).toBe("true");
  });

  it("opens on hover and closes only after the pointer-leave grace period", () => {
    vi.useFakeTimers();
    act(() => root?.render(menu()));

    const product = container?.querySelector<HTMLButtonElement>('[data-public-nav-trigger="product"]');
    const item = product?.closest("li");
    if (!product || !item) throw new Error("product navigation trigger did not render");

    act(() => {
      item.dispatchEvent(
        new MouseEvent("mouseover", {
          bubbles: true,
          relatedTarget: document.body,
        }),
      );
    });
    expect(product.getAttribute("aria-expanded")).toBe("true");

    act(() => {
      item.dispatchEvent(
        new MouseEvent("mouseout", {
          bubbles: true,
          relatedTarget: document.body,
        }),
      );
      vi.advanceTimersByTime(179);
    });
    expect(product.getAttribute("aria-expanded")).toBe("true");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(product.getAttribute("aria-expanded")).toBe("false");
    vi.useRealTimers();
  });

  it("keeps the menu open after pointer leave while keyboard focus remains inside", () => {
    vi.useFakeTimers();
    act(() => root?.render(menu()));

    const product = container?.querySelector<HTMLButtonElement>('[data-public-nav-trigger="product"]');
    const item = product?.closest("li");
    if (!product || !item) throw new Error("product navigation trigger did not render");

    product.focus();
    act(() => {
      product.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
    });
    act(() => {
      item.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
      vi.advanceTimersByTime(180);
    });
    expect(product.getAttribute("aria-expanded")).toBe("true");

    act(() => {
      product.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Tab" }));
    });
    const firstLink = container?.querySelector<HTMLAnchorElement>('a[href="/features/self-hosted"]');
    const content = container?.querySelector<HTMLElement>('[data-slot="popover-content"]');
    if (!firstLink || !content) throw new Error("open product navigation panel did not render");
    expect(document.activeElement).toBe(firstLink);

    act(() => {
      content.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
      vi.advanceTimersByTime(180);
    });
    expect(product.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(firstLink);
  });

  it("cancels a pending hover close before keyboard reopening and clears timers on unmount", () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    act(() => root?.render(menu()));

    const product = container?.querySelector<HTMLButtonElement>('[data-public-nav-trigger="product"]');
    const item = product?.closest("li");
    if (!product || !item) throw new Error("product navigation trigger did not render");

    act(() => {
      item.dispatchEvent(
        new MouseEvent("mouseover", {
          bubbles: true,
          relatedTarget: document.body,
        }),
      );
      item.dispatchEvent(
        new MouseEvent("mouseout", {
          bubbles: true,
          relatedTarget: document.body,
        }),
      );
    });
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    act(() => {
      product.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    });
    expect(clearTimeoutSpy).toHaveBeenCalled();

    act(() => {
      product.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
      vi.advanceTimersByTime(180);
    });
    expect(product.getAttribute("aria-expanded")).toBe("true");

    act(() => {
      item.dispatchEvent(
        new MouseEvent("mouseout", {
          bubbles: true,
          relatedTarget: document.body,
        }),
      );
    });
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    const clearCountBeforeUnmount = clearTimeoutSpy.mock.calls.length;
    act(() => root?.unmount());
    expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(clearCountBeforeUnmount);
    clearTimeoutSpy.mockRestore();
  });

  it("marks the active destination as the current page", () => {
    const markup = renderToStaticMarkup(
      createElement(PublicNavbarMenu, {
        ariaLabel: "Primary navigation",
        docsLabel: "Documentation",
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

  it("keeps documentation as one standalone current destination", () => {
    const markup = renderToStaticMarkup(
      createElement(PublicNavbarMenu, {
        ariaLabel: "Primary navigation",
        docsLabel: "Documentation",
        groups,
        onNavigate: vi.fn(),
        pathname: "/docs",
        pricingLabel: "Pricing",
      }),
    );

    expect(resolveActivePublicNavGroup("/docs", groups)).toBeNull();
    expect(markup.match(/href="\/docs"/gu)).toHaveLength(1);
    expect(markup).toMatch(/<a(?=[^>]*aria-current="page")(?=[^>]*href="\/docs")[^>]*>/u);
    expect(markup.match(/aria-current="page"/gu)).toHaveLength(1);
  });

  it("resolves overlapping routes to one active group and one current link", () => {
    const productGroup = groups[0];
    if (!productGroup) throw new Error("product navigation fixture did not render");

    const unifiedInbox = {
      href: "/features/unified-inbox",
      title: "Unified inbox",
    };
    const whatsapp = { activeMatch: false, href: "/features/unified-inbox", title: "WhatsApp" };
    const overlappingGroups: PublicNavGroup[] = [
      {
        ...productGroup,
        links: [...productGroup.links, unifiedInbox],
      },
      {
        activeHref: "/features/integrations",
        columns: 2,
        icon: Boxes,
        id: "integrations",
        links: [
          { href: "/features/linkedin-integration", title: "LinkedIn" },
          whatsapp,
          { activeMatch: false, href: "/docs/mcp", title: "MCP guide" },
        ],
        title: "Integrations",
      },
      {
        activeHref: "/blog",
        columns: 2,
        icon: UsersRound,
        id: "resources",
        links: [
          { href: "/docs", title: "Documentation" },
          { href: "/docs/mcp", title: "MCP guide" },
        ],
        title: "Resources",
      },
    ];

    expect(resolveActivePublicNavGroup("/features/linkedin-integration", overlappingGroups)).toBe("integrations");
    expect(resolveActivePublicNavGroup("/docs/mcp", overlappingGroups)).toBe("resources");
    expect(resolveActivePublicNavGroup("/features/unified-inbox", overlappingGroups)).toBe("product");
    expect(isPrimaryPublicNavLink(overlappingGroups, unifiedInbox)).toBe(true);
    expect(isPrimaryPublicNavLink(overlappingGroups, whatsapp)).toBe(false);

    const markup = renderToStaticMarkup(
      createElement(PublicNavbarMenu, {
        ariaLabel: "Primary navigation",
        docsLabel: "Documentation",
        groups: overlappingGroups,
        onNavigate: vi.fn(),
        pathname: "/features/unified-inbox",
        pricingLabel: "Pricing",
      }),
    );

    expect(markup).toMatch(/data-public-nav-active="true"[^>]*data-public-nav-trigger="product"/u);
    expect(markup.match(/aria-current="page"/gu)).toHaveLength(1);
  });
});
