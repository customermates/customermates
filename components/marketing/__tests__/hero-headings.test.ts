import type { AnchorHTMLAttributes } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (key: string) => key }));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props, children),
  usePathname: () => "/",
}));
vi.mock("@/components/marketing/agpl-github-badge", () => ({ AgplGithubBadge: () => null }));

import { HomepageHero } from "@/app/[locale]/(static)/components/homepage-hero";
import { PageHero } from "../page-hero";

function textOutsideTags(markup: string): string {
  let text = "";
  let insideTag = false;

  for (const character of markup) {
    if (character === "<") insideTag = true;
    else if (character === ">") insideTag = false;
    else if (!insideTag) text += character;
  }

  return text;
}

function headingText(html: string): string {
  const headings = html.match(/<h1\b[\s\S]*?<\/h1>/gu) ?? [];

  expect(headings).toHaveLength(1);

  return textOutsideTags(headings[0] ?? "")
    .replace(/\s+/gu, " ")
    .trim();
}

describe("hero headings", () => {
  it("keeps the rotating homepage variants out of the h1", () => {
    const html = renderToStaticMarkup(
      createElement(HomepageHero, {
        heroSection: {
          buttonLeftHref: "/auth/signup",
          buttonLeftText: "Start free",
          buttonRightHref: "#demo",
          buttonRightText: "Watch",
          startFree: "No card",
          subtitle: "Subtitle",
          title: "The open-source CRM",
          titleAccentRotations: ["for AI agents.", "for Claude.", "for ChatGPT."],
          useCase: "Use case",
        } as Parameters<typeof HomepageHero>[0]["heroSection"],
      }),
    );

    expect(headingText(html)).toBe("The open-source CRM for AI agents.");
    expect(html).toContain("for Claude.");
  });

  it("keeps a page hero's accent phrase beside the h1 rather than inside it", () => {
    const html = renderToStaticMarkup(
      createElement(PageHero, {
        description: "Description",
        title: "Start with the customer workflow",
        titleAccent: "see what fits.",
      }),
    );

    expect(headingText(html)).toBe("Start with the customer workflow");
    expect(html).toContain("see what fits.");
  });
});
