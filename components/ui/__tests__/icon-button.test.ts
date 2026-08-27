import type { ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExternalLink, Star } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => createElement("div", { "data-slot": "tooltip" }, children),
  TooltipTrigger: ({ children }: { children: ReactNode }) =>
    createElement("span", { "data-slot": "tooltip-trigger" }, children),
  TooltipContent: ({ children }: { children: ReactNode }) =>
    createElement("span", { "data-slot": "tooltip-content" }, children),
}));

vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, ...props }: { children: ReactNode; href: string }) => createElement("a", props, children),
}));

import { IconButton } from "../icon-button";

describe("IconButton field actions", () => {
  it("gives button and link actions the same footprint, icon size, hover treatment, and tooltip", () => {
    const button = renderToStaticMarkup(
      createElement(IconButton, {
        fieldAction: true,
        icon: Star,
        iconClassName: "fill-current text-primary",
        label: "Remove Services from the overview",
        pressed: true,
        onClick: vi.fn(),
      }),
    );
    const link = renderToStaticMarkup(
      createElement(IconButton, {
        fieldAction: true,
        href: "/services",
        icon: ExternalLink,
        label: "Open list",
      }),
    );

    for (const markup of [button, link]) {
      expect(markup).toContain("size-5");
      expect(markup).toContain("rounded-md");
      expect(markup).toContain("hover:bg-accent");
      expect(markup).toContain("size-3.5");
    }

    expect(button).toContain('aria-pressed="true"');
    expect(button).toContain("fill-current text-primary");
    expect(button).toContain('data-slot="tooltip-content">Remove Services from the overview</span>');
    expect(link).toContain('href="/services"');
    expect(link).not.toContain("aria-pressed");
    expect(link).toContain('data-slot="tooltip-content">Open list</span>');
  });

  it("does not change the compact default presentation outside field labels", () => {
    const markup = renderToStaticMarkup(
      createElement(IconButton, {
        icon: Star,
        label: "Copy",
        onClick: vi.fn(),
      }),
    );

    expect(markup).toContain("size-3");
    expect(markup).not.toContain("size-5");
    expect(markup).not.toContain("hover:bg-accent");
  });
});
