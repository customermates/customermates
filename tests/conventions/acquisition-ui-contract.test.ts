import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

function source(path: string) {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

describe("public acquisition UI contract", () => {
  it("mounts one route-persistent consent controller above the public route groups", () => {
    const localeLayout = source("app/[locale]/layout.tsx");
    const staticLayout = source("app/[locale]/(static)/layout.tsx");
    const contactPage = source("app/[locale]/(static)/contact/page.tsx");

    expect(localeLayout).toContain("<PublicAdAttributionConsentCard />");
    expect(localeLayout).toContain('env.APP_MODE === "cloud" && isContentLocale(locale)');
    expect(staticLayout).not.toContain("PublicAdAttributionConsentCard");
    expect(contactPage).not.toContain("PublicAdAttributionConsentCard");
  });

  it("uses the current marketing system for shared heroes and closing panels", () => {
    const hero = source("components/marketing/page-hero.tsx");
    expect(hero).not.toContain("<GridPattern");
    expect(hero).toContain('<div aria-hidden className="mk-hero-light" />');
    expect(hero).toContain("<MarketingContainer");
    expect(hero).toContain('visual ? "mk-display" : "mk-hero max-w-[60rem]"');
    expect(hero).toContain("visual?: ReactNode");
    expect(hero).not.toContain("WaveDecoration");
    expect(hero).not.toContain("var(--font-serif)");
    expect(hero).toContain("type HeroWithoutActions");
    expect(hero).toContain("function hasHeroActions");
    expect(hero).toContain("<MarketingButton arrow href={actions.buttonLeftHref} size=\"lg\">");
    expect(hero).toContain("{actions ? (");

    const button = source("components/marketing/marketing-button.tsx");
    expect(button).toContain('return href.startsWith("https://") || href.startsWith("http://");');
    expect(button).toContain("rel={externalLinkRel(href)}");
    expect(button).toContain('target="_blank"');

    const closing = source("components/marketing/cta-section.tsx");
    expect(closing).toContain("<MarketingSection");
    expect(closing).toContain("mk-card-raised");
    expect(closing).toContain("<MarketingButton arrow href={buttonLeftHref} size=\"lg\">");
    expect(closing).toContain('<MarketingButton href={buttonRightHref} size="lg" variant="secondary">');
    expect(closing).not.toContain("border-y border-border");
    expect(closing).not.toContain("bg-sidebar");
    expect(closing).not.toContain("rgba(");
    expect(closing).not.toContain("blur-[80px]");
  });

  it("keeps retired public decoration code and assets out of every marketing shell", () => {
    for (const route of [
      "app/[locale]/(static)/contact/page.tsx",
      "app/[locale]/(static)/affiliate/page.tsx",
      "app/[locale]/(static)/help-and-feedback/page.tsx",
    ]) {
      expect(source(route), route).toContain("<PageHero");
      expect(source(route), route).toContain(
        'data-marketing-flow="continuous"',
      );
    }

    const runtimeFiles = ["app", "components", "styles"].flatMap((directory) =>
      walkFiles(join(REPO_ROOT, directory), (path) =>
        /\.(?:css|tsx?)$/u.test(path),
      ),
    );
    const runtimeSource = runtimeFiles
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");

    expect(runtimeSource).not.toContain("WaveDecoration");
    expect(runtimeSource).not.toContain("wave-decoration");
    expect(runtimeSource).not.toContain("/decorations/");
    expect(runtimeSource).not.toContain("text-x-4xl");

    for (const retiredPath of [
      "app/[locale]/(static)/affiliate/components/affiliate-hero.tsx",
      "components/marketing/wave-decoration.tsx",
      "public/decorations/elements.svg",
      "public/decorations/wave-1.svg",
      "public/decorations/wave-2.svg",
    ])
      expect(existsSync(join(REPO_ROOT, retiredPath)), retiredPath).toBe(false);

    const comparison = source("components/marketing/comparison-table.tsx");
    const tableFrame = source("components/marketing/marketing-table-frame.tsx");
    expect(comparison).toContain("<MarketingSection");
    expect(comparison).toContain("<SectionHeader eyebrow={eyebrow} title={title} />");
    expect(tableFrame).not.toContain("rgba(");
    expect(tableFrame).not.toContain("shadow-");
  });

  it("keeps the contact form personal without adding another contact card", () => {
    const form = source("app/[locale]/(static)/contact/contact-form.tsx");

    expect(form).toContain("<AppImage");
    expect(form).toContain('src="benjamin-wagner.png"');
    expect(form).toContain('sizes="48px"');
    expect(form).toContain("ContactPage.form.founderName");
    expect(form).toContain("ContactPage.form.founderRole");
    expect(form).toContain("ContactPage.form.founderNote");
    expect(form).not.toContain(">Benjamin Wagner<");
    expect(form).not.toContain("FounderContactCard");
    expect(form).not.toContain("Common.actions.contact");
  });

  it("aligns pricing summaries without pretending that unequal benefits are table rows", () => {
    const section = source(
      "app/[locale]/(static)/pricing/components/pricing-section.tsx",
    );
    const card = source(
      "app/[locale]/(static)/pricing/components/pricing-card.tsx",
    );
    const comparison = source(
      "components/marketing/responsive-comparison-table.tsx",
    );

    expect(section).toContain("rounded-card border border-border bg-card");
    expect(section).toContain("<output");
    expect(section).toContain('htmlFor="pricing-user-count"');
    expect(section).toContain('id="pricing-user-count"');
    expect(card).toContain("md:row-span-5 md:grid md:grid-rows-subgrid");
    expect(card).toContain("grid content-start gap-3");
    expect(card).not.toContain("divide-y divide-border");
    expect(card).not.toContain("border-t border-border");
    expect(comparison).toContain("<thead");
    expect(comparison).toContain("sticky! top-[var(--table-sticky-top,0px)]");
  });

  it("uses sticky overview labels and complete frames outside long-form articles", () => {
    const featureGroups = source("app/[locale]/(static)/features/components/base-features-section.tsx");
    expect(featureGroups).toContain("lg:sticky lg:top-24");
    expect(featureGroups).toContain("lg:self-start");
    expect(featureGroups).toContain('<SectionHeader align="start"');
    expect(source("app/[locale]/(static)/features/components/why-features-section.tsx")).toContain("<SectionHeader");

    for (const route of [
      "components/marketing/feature-section.tsx",
      "app/[locale]/(static)/n8n-crm/components/automation-benefits.tsx",
    ]) {
      const section = source(route);
      expect(section, route).toContain(
        "rounded-card border border-border bg-card",
      );
      expect(section, route).not.toContain("grid border-y border-border");
    }
  });

  it("keeps long-form content readable and media explicit", () => {
    const article = source("components/marketing/landing-article.tsx");
    expect(article).not.toContain('tone="canvas"');
    expect(article).toContain("mx-auto max-w-[96ch]");
    expect(article).toContain("[&>p]:max-w-[82ch]");
    expect(article).toContain("lg:mx-0 lg:max-w-none");
    expect(article).toContain("prose-headings:font-semibold");
    expect(article).toContain(
      "asideFooter={founderContact ? <FounderContactCard /> : undefined}",
    );
    expect(article).toContain("[--toc-sticky-top:5.5rem]");
    expect(article).toContain("[--toc-anchor-offset:5.5rem]");
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

  it("keeps generic marketing icons neutral ink without recoloring provider marks", () => {
    for (const route of [
      "app/[locale]/(static)/features/components/base-features-section.tsx",
      "app/[locale]/(static)/features/components/why-features-section.tsx",
      "app/[locale]/(static)/n8n-crm/components/automation-benefits.tsx",
    ]) {
      const section = source(route);
      expect(section, route).toContain("border border-border bg-card text-foreground");
      expect(section, route).not.toMatch(/(?:bg|text|border)-agent/u);
    }

    const whyFeatures = source(
      "app/[locale]/(static)/features/components/why-features-section.tsx",
    );
    expect(whyFeatures).toContain("<Icon aria-hidden icon={IconComponent} />");
  });

  it("keeps the founder contact on every long-form detail page", () => {
    const article = source("components/marketing/landing-article.tsx");
    const card = source("components/marketing/founder-contact-card.tsx");
    const toc = source("components/shared/toc.tsx");

    expect(article).toContain("founderContact = false");
    expect(article.match(/<FounderContactCard/gu)).toHaveLength(1);
    expect(card).toContain('href="/contact"');
    expect(card).toContain('src="benjamin-wagner.png"');
    expect(card).toContain("highlights.personal.body");
    expect(card).toContain('data-founder-contact-variant="note"');
    expect(card).not.toContain("FounderContactCardVariant");
    expect(toc).toContain("asideFooter?: ReactNode");
    expect(toc).toContain("hasMobileFooter");
    expect(toc).toContain('hasMobileFooter && "hidden lg:block"');
    expect(toc).toContain("{asideFooter ?");

    for (const route of [
      "app/[locale]/(static)/features/[slug]/page.tsx",
      "app/[locale]/(static)/for/[industry]/page.tsx",
      "app/[locale]/(static)/compare/[competitor]/page.tsx",
    ]) {
      expect(source(route), route).toContain("<LandingArticle founderContact");
    }

    expect(source("app/[locale]/(static)/blog/[slug]/page.tsx")).toContain(
      "<LandingArticle founderContact items={page.data.toc}",
    );
  });

  it("uses one route-owned related-content and CTA ending across acquisition and blog pages", () => {
    const ending = source("components/marketing/page-ending.tsx");
    const related = source("components/marketing/related-pages.tsx");
    expect(ending).toContain("<RelatedPages>");
    expect(ending).toContain("relatedHrefs.map");
    expect(ending.indexOf("<RelatedPages>")).toBeLessThan(
      ending.indexOf("<CTASection"),
    );
    expect(related).not.toContain("presentation");
    expect(related).not.toContain("HubPostCard");
    expect(related).not.toContain("imageSrc");
    expect(related).toContain("<ArrowUpRight");
    expect(related).toContain("target.description");
    expect(related).toContain("target.title");
    expect(related).toContain("border-t border-border");

    for (const route of [
      "app/[locale]/(static)/features/[slug]/page.tsx",
      "app/[locale]/(static)/for/[industry]/page.tsx",
      "app/[locale]/(static)/compare/[competitor]/page.tsx",
      "app/[locale]/(static)/blog/[slug]/page.tsx",
    ]) {
      const routeSource = source(route);
      const article = routeSource.indexOf("<LandingArticle");
      const endingUse = routeSource.indexOf("<PageEnding", article);
      const footer = routeSource.indexOf("<Footer", endingUse);
      expect(endingUse, route).toBeGreaterThan(article);
      expect(footer, route).toBeGreaterThan(endingUse);
    }
  });

  it("keeps article proof and callout icons on the homepage and product primitives", () => {
    const blocks = source("components/marketing/article-blocks.tsx");
    const alert = source("components/shared/alert.tsx");

    expect(blocks).toContain(
      'className="not-prose my-10 border-y border-border"',
    );
    expect(blocks).not.toContain("CircleCheckBig");
    expect(blocks).not.toContain(
      'className="not-prose my-10 border-y border-border bg-background"',
    );
    expect(blocks).toContain("icon: ALERT_ICONS.warning");
    expect(blocks).toContain("icon: ALERT_ICONS.info");
    expect(blocks).toContain("icon: ALERT_ICONS.neutral");
    expect(blocks).not.toContain("size-8 shrink-0 place-items-center");
    expect(alert).toContain("export const ALERT_ICONS");

    const postCard = source("components/marketing/post-card.tsx");
    expect(postCard).toContain("mk-card mk-card-interactive");
    expect(postCard).not.toContain("AppImage");
    expect(postCard).not.toContain("placeholderLabel");
    expect(postCard).not.toContain("from-primary/25 via-primary/10");
  });

  it("keeps article summaries balanced on every breakpoint", () => {
    const articleBlocks = source("components/marketing/article-blocks.tsx");
    expect(articleBlocks).toContain("sm:last:col-span-2");
    expect(articleBlocks).toContain("lg:last:col-span-1");
    expect(existsSync(join(REPO_ROOT, "components/marketing/acquisition-story-visual.tsx"))).toBe(false);
  });

  it("keeps the blog header text-led and delegates social imagery to the generated OG schema", () => {
    const blog = source("app/[locale]/(static)/blog/[slug]/page.tsx");
    const heading = blog.indexOf('<h1 className="mk-display m-0 max-w-[48rem]">');
    const timestamp = blog.indexOf("<time", heading);

    expect(heading).toBeGreaterThan(-1);
    expect(timestamp).toBeGreaterThan(heading);
    expect(blog).not.toContain("AcquisitionStoryVisual");
    expect(blog).not.toContain("BlogHeroMedia");
    expect(blog).not.toContain("includeHeroImage");
    expect(source("core/seo/schemas.ts")).toContain("image: [ogImage]");
  });
});
