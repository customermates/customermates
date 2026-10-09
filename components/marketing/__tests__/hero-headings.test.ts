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
  it("keeps the whole homepage claim, including its muted accent, inside one h1", () => {
    const html = renderToStaticMarkup(
      createElement(HomepageHero, {
        heroSection: {
          buttonLeftHref: "/auth/signup",
          buttonLeftText: "Start free",
          buttonRightHref: "#demo",
          buttonRightText: "Watch",
          stage: {
            disclosure: "Sample data.",
            label: "Product areas",
            live: { prompt: "Try it live", status: "Live demo." },
            tabs: [
              { alt: "Inbox", capture: "homepage-inbox", caption: "Inbox caption", label: "Inbox" },
              { alt: "Record", capture: "homepage-record", caption: "Record caption", label: "Customers" },
              { alt: "Pipeline", capture: "homepage-pipeline", caption: "Pipeline caption", label: "Pipeline" },
              { alt: "Dashboard", capture: "homepage-dashboard", caption: "Dashboard caption", label: "Dashboard" },
              { alt: "Routines", capture: "homepage-routines", caption: "Routines caption", label: "Routines" },
            ],
          },
          startFree: "No card",
          subtitle: "Subtitle",
          title: "The CRM that updates itself",
          titleAccent: "from your inbox.",
          useCase: "Use case",
        },
        locale: "en",
      }),
    );

    expect(headingText(html)).toBe("The CRM that updates itself from your inbox.");
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/gu)).toHaveLength(5);
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
