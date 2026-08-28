import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

function source(path: string) {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

describe("public acquisition UI contract", () => {
  it("uses the current marketing system for shared heroes and closing panels", () => {
    const hero = source("components/marketing/page-hero.tsx");
    expect(hero).toContain("<GridPattern");
    expect(hero).toContain("<MarketingContainer");
    expect(hero).toContain("text-display");
    expect(hero).toContain("visual?: ReactNode");
    expect(hero).not.toContain("WaveDecoration");
    expect(hero).not.toContain("var(--font-serif)");

    const closing = source("components/marketing/cta-section.tsx");
    expect(closing).toContain("<MarketingSection");
    expect(closing).toContain("rounded-card border border-border bg-sidebar");
    expect(closing).not.toContain("rgba(");
    expect(closing).not.toContain("blur-[80px]");
  });

  it("keeps long-form content readable and media explicit", () => {
    const article = source("components/marketing/landing-article.tsx");
    expect(article).toContain('tone="canvas"');
    expect(article).toContain("mx-auto max-w-[80ch]");
    expect(article).toContain("lg:mx-0 lg:max-w-none");
    expect(article).toContain('<Toc items={items} layout="article">');
    expect(article).not.toContain("rounded-panel");
    expect(article).not.toContain("shadow-sm");

    for (const route of [
      "app/[locale]/(static)/features/[slug]/page.tsx",
      "app/[locale]/(static)/for/[industry]/page.tsx",
      "app/[locale]/(static)/compare/[competitor]/page.tsx",
      "app/[locale]/(static)/blog/[slug]/page.tsx",
    ]) {
      const routeSource = source(route);
      expect(routeSource, route).toContain("<LandingArticle");
      expect(routeSource, route).not.toContain("<ShowcaseFrame");
    }
  });

  it("recomposes acquisition artboards across every approved placement without an outer frame", () => {
    const visual = source("components/marketing/acquisition-story-visual.tsx");
    const artboardOpening = visual.match(/<VisualArtboard[\s\S]*?>/u)?.[0];

    expect(visual).toContain("VISUAL_PLACEMENTS.filter");
    expect(visual).toContain('data-acquisition-responsive-placements="narrow:base wide:sm split:lg"');
    expect(visual).toContain('data-detail-budget="narrow:2 wide:4 split:3"');
    expect(visual).toContain('data-supported-placements={brief.placements.join(" ")}');
    expect(visual).toContain("aspect-[3/4]");
    expect(visual).toContain("sm:aspect-hero");
    expect(visual).toContain("sm:min-h-[30rem]");
    expect(visual).toContain("lg:aspect-[4/5]");
    expect(visual).toContain("lg:min-h-0");
    expect(artboardOpening).toBeDefined();
    expect(artboardOpening).not.toMatch(/\bborder(?:-|\b)|\bshadow(?:-|\b)/u);
  });

  it("binds dense acquisition scenes to declared fixture-backed subjects", () => {
    const visual = source("components/marketing/acquisition-story-visual.tsx");
    expect(visual).toContain("VISUAL_CONVERSATION_FIXTURES[conversationId]");
    expect(visual).not.toContain('VISUAL_CONVERSATION_FIXTURES["gmail-rollout-next-steps"]');
    expect(visual).toContain("data-visual-subject={conversationList.id}");
    expect(visual).toContain("data-visual-subject={contactContext.id}");
    expect(visual).toContain('formatDealValue(record, locale, "weighted")');
    expect(visual).toContain("<NativeAgentProviderIdentity");
    expect(visual).toContain('strokeLinecap="butt"');
    expect(visual).toContain('vectorEffect="non-scaling-stroke"');
    expect(visual).not.toMatch(/ArrowDown|ArrowRight/u);
    expect(visual).not.toContain("{brief.takeaway}</p>");
  });

  it("puts the blog title and metadata before its authored visual", () => {
    const blog = source("app/[locale]/(static)/blog/[slug]/page.tsx");
    const heading = blog.indexOf('<h1 className="text-display m-0">');
    const timestamp = blog.indexOf("<time", heading);
    const visual = blog.indexOf("{visual ?", timestamp);

    expect(heading).toBeGreaterThan(-1);
    expect(timestamp).toBeGreaterThan(heading);
    expect(visual).toBeGreaterThan(timestamp);
    expect(blog).toContain("includeHeroImage: !page.data.acquisition");
  });
});
