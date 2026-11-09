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
  it("keeps the whole homepage claim inside one h1 with the trial and film calls to action", () => {
    const html = renderToStaticMarkup(
      createElement(HomepageHero, {
        heroSection: {
          assurance: "No credit card",
          primaryCta: { href: "/auth/signup?job=followup", label: "Start your 14-day trial" },
          secondaryCta: { href: "#film", label: "Watch the film (46 s)" },
          subtitle: "Subtitle",
          title: "Follow up on every client conversation.",
        },
      }),
    );

    expect(headingText(html)).toBe("Follow up on every client conversation.");
    expect(html).toContain('href="#film"');
    expect(html).toContain("job=followup");
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
