import type { AnchorHTMLAttributes, ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props, children),
}));

import { AppLink } from "@/components/shared/app-link";
import { markdownBaseComponents } from "../markdown-base-components";

describe("inline link appearance", () => {
  it("keeps inline AppLinks in the surrounding text color", () => {
    const html = renderToStaticMarkup(
      createElement(AppLink, { appearance: "inline", href: "/docs", inheritSize: true }, "Read more"),
    );

    expect(html).toContain('class="inline-link [font-size:inherit]"');
    expect(html).not.toContain("text-primary");
  });

  it("uses the same inline appearance for Markdown links", () => {
    const MarkdownLink = markdownBaseComponents.a as (props: AnchorHTMLAttributes<HTMLAnchorElement>) => ReactNode;
    const html = renderToStaticMarkup(createElement(MarkdownLink, { href: "/docs" }, "Markdown guide"));

    expect(html).toContain("inline-link");
    expect(html).not.toContain("text-primary");
    expect(html).not.toContain("decoration-current");
  });
});
