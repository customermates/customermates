import type { AnchorHTMLAttributes } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (key: string) => key }));
vi.mock("@/i18n/navigation", () => ({
  IntlLink: ({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props, children),
  usePathname: () => "/",
}));
vi.mock("@/components/marketing/source-badge", () => ({ SourceBadge: () => null }));
vi.mock("@/components/marketing/ai-badge", () => ({ AiBadge: () => null }));

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
  it("keeps the whole homepage claim inside one h1 with the template picker and film calls to action", () => {
    const html = renderToStaticMarkup(
      createElement(HomepageHero, {
        heroSection: {
          assurances: {
            database: "Database in Frankfurt",
            noCard: "No credit card",
            sourceAvailable: "Source available",
          },
          badge: "Works with Claude, ChatGPT, Codex and Gemini",
          picker: {
            choices: [
              { label: "Sales leads", template: "sales-pipeline" },
              { label: "Clients", template: "client-tracker" },
              { label: "Website inquiries", template: "form-to-crm" },
              { label: "Bookings", template: "booking-page" },
            ],
            cta: "Start free with {choice}",
            question: "What do you want to follow up on?",
          },
          secondaryCta: { href: "#film", label: "Watch the film" },
          subtitle: "Subtitle",
          title: "Follow up on every client conversation.",
        },
      }),
    );

    expect(headingText(html)).toBe("Follow up on every client conversation.");
    expect(html).toContain('href="#film"');
    expect(html).toContain("Start free with Sales leads");
    expect(html).toContain("job=followup&amp;template=sales-pipeline");
    expect(html).toContain('data-homepage-hero-film=""');
    expect(html).not.toContain("github.com");
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
