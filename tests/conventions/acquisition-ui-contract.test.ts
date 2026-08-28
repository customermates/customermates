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
    expect(article).toContain("max-w-[72ch]");
    expect(article).toContain("<Toc items={items}>");

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
