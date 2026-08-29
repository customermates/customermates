import type { ReactNode, SVGProps } from "react";

import { renderToStaticMarkup } from "react-dom/server";
import { jsx } from "react/jsx-runtime";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/sidebar", () => ({
  SidebarGroup: ({ children }: { children: ReactNode }) => jsx("div", { children }),
  SidebarGroupContent: ({ children }: { children: ReactNode }) => jsx("div", { children }),
  SidebarMenu: ({ children }: { children: ReactNode }) => jsx("div", { children }),
  SidebarMenuButton: ({ children, isActive = false }: { children: ReactNode; isActive?: boolean }) =>
    jsx("div", { "data-active": isActive, children }),
  SidebarMenuItem: ({ children }: { children: ReactNode }) => jsx("div", { children }),
}));
vi.mock("@/components/shared/app-link", () => ({
  AppLink: ({ children, prefetch: _prefetch, ...props }: { children: ReactNode; prefetch?: boolean }) =>
    jsx("a", { ...props, children }),
}));
vi.mock("../nav-link-pending-icon", () => ({
  NavLinkPendingIcon: () => jsx("svg", { "aria-hidden": true }),
}));

import { NavSecondary } from "../nav-secondary";

const TestIcon = (_props: SVGProps<SVGSVGElement>) => jsx("svg", {});

describe("NavSecondary", () => {
  it("marks the active operator link both visually and semantically", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(
      <NavSecondary
        items={[
          {
            key: "operator",
            title: "Operator",
            icon: TestIcon,
            href: "/operator/users",
            isActive: true,
            ariaCurrent: "page",
          },
          {
            key: "docs",
            title: "Docs",
            icon: TestIcon,
            href: "/docs",
          },
        ]}
      />,
    );

    const operatorLink = container.querySelector<HTMLAnchorElement>("#nav-operator");
    const docsLink = container.querySelector<HTMLAnchorElement>("#nav-docs");

    expect(operatorLink).not.toBeNull();
    expect(operatorLink?.getAttribute("aria-current")).toBe("page");
    expect(operatorLink?.parentElement?.getAttribute("data-active")).toBe("true");
    expect(docsLink?.hasAttribute("aria-current")).toBe(false);
    expect(docsLink?.parentElement?.getAttribute("data-active")).toBe("false");
  });

  it("can keep an operator section visually active without claiming the Users link is the current page", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToStaticMarkup(
      <NavSecondary
        items={[
          {
            key: "operator",
            title: "Operator",
            icon: TestIcon,
            href: "/operator/users",
            isActive: true,
          },
        ]}
      />,
    );

    const operatorLink = container.querySelector<HTMLAnchorElement>("#nav-operator");
    expect(operatorLink?.hasAttribute("aria-current")).toBe(false);
    expect(operatorLink?.parentElement?.getAttribute("data-active")).toBe("true");
  });
});
