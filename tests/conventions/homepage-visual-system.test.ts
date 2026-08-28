import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

const HOMEPAGE_ROOT = join(REPO_ROOT, "app", "[locale]", "(static)");
const COMPONENT_ROOT = join(HOMEPAGE_ROOT, "components");
const globalStyles = readFileSync(
  join(REPO_ROOT, "styles", "globals.css"),
  "utf8",
);
const englishHomepage = readFileSync(
  join(REPO_ROOT, "content", "homepage", "en", "homepage.mdx"),
  "utf8",
);
const previewBoundarySource = [
  readFileSync(join(REPO_ROOT, "proxy.ts"), "utf8"),
  readFileSync(
    join(
      REPO_ROOT,
      "app",
      "components",
      "navigation",
      "navigation-switch.tsx",
    ),
    "utf8",
  ),
].join("\n");

function readComponent(file: string) {
  return readFileSync(join(COMPONENT_ROOT, file), "utf8");
}

const page = readFileSync(join(HOMEPAGE_ROOT, "page.tsx"), "utf8");
const components = [
  "homepage-benefits.tsx",
  "homepage-closing.tsx",
  "homepage-hero.tsx",
  "homepage-how-it-works.tsx",
  "homepage-live-demo.tsx",
  "homepage-pipeline.tsx",
  "homepage-pricing.tsx",
  "homepage-product-proof.tsx",
  "homepage-stats-row.tsx",
  "homepage-story-visuals.tsx",
  "homepage-viewport-video.tsx",
  "homepage-walkthrough.tsx",
].map(readComponent);
const componentSource = components.join("\n");

describe("homepage visual-system adoption", () => {
  it("keeps narrative visuals deterministic and orders live proof before the walkthrough video", () => {
    const hero = readComponent("homepage-hero.tsx");
    const liveDemo = readComponent("homepage-live-demo.tsx");
    const proof = readComponent("homepage-product-proof.tsx");
    const viewportVideo = readComponent("homepage-viewport-video.tsx");
    const visuals = readComponent("homepage-story-visuals.tsx");

    expect(page).not.toMatch(/HomepageClipTerminal|FeatureSection/u);
    expect(page).toContain("HomepageLiveDemo");
    expect(page).toContain("HomepageProductProof");
    expect(liveDemo.match(/<HeroDemoIframe\b/gu)).toHaveLength(1);
    expect(liveDemo).toContain("const demoPath = `/${locale}/dashboard`");
    expect(liveDemo).not.toMatch(/inbox|threadId|DEMO_INBOX_THREAD_ID/u);
    expect(hero).not.toMatch(/HeroDemoIframe|<iframe\b/u);
    expect(proof.match(/<HomepageViewportVideo\b/gu)).toHaveLength(1);
    expect(viewportVideo.match(/<video\b/gu)).toHaveLength(1);
    expect(proof).not.toMatch(/HeroDemoIframe|<iframe\b/u);
    expect(page.indexOf("<HomepageHero")).toBeLessThan(
      page.indexOf("<HomepageLiveDemo"),
    );
    expect(page.indexOf("<HomepageLiveDemo")).toBeLessThan(
      page.indexOf("<HomepageProductProof"),
    );
    expect(page.indexOf("<HomepageProductProof")).toBeLessThan(
      page.indexOf("<HomepageStatsRow"),
    );
    expect(visuals).not.toMatch(/<video\b|<iframe\b|HeroDemoIframe/u);
    expect(componentSource).not.toMatch(/GoldenStoryVisual|GOLDEN_LAYOUT/u);
  });

  it("does not ship the local marketing-preview authentication bypass", () => {
    expect(previewBoundarySource).not.toContain("marketing-preview");
  });

  it("autoplays the walkthrough only while it is meaningfully visible", () => {
    const viewportVideo = readComponent("homepage-viewport-video.tsx");

    expect(viewportVideo).toContain("IntersectionObserver");
    expect(viewportVideo).toContain("AUTOPLAY_VISIBILITY_THRESHOLD = 0.55");
    expect(viewportVideo).toContain("prefers-reduced-motion: reduce");
    expect(viewportVideo).toContain('document.visibilityState === "visible"');
    expect(viewportVideo).toContain("userPausedRef");
    expect(viewportVideo).toContain("userUnmutedRef");
    expect(viewportVideo).toContain("video.pause()");
    expect(viewportVideo).toContain("video.play()");
    expect(viewportVideo).not.toMatch(/\bautoPlay\b|\bloop\b/u);
  });

  it("builds the centered opening from every approved inbox provider", () => {
    const hero = readComponent("homepage-hero.tsx");

    expect(hero).toContain('VISUAL_PROVIDER_SET_FIXTURES["unified-inbox"]');
    expect(hero).toContain("ProviderMark");
    expect(hero).toContain("GridPattern");
    expect(hero).toContain('fade="bottom"');
    expect(hero).not.toMatch(
      /HomepageAgentRecordVisual|GoogleCalendar|OutlookCalendar|Messenger|XTwitter/u,
    );
    expect(englishHomepage).toContain("title: The open-source CRM built for");
    expect(englishHomepage).toContain("titleAccent: AI agents.");
  });

  it("keeps the live workspace on-page and gives the walkthrough the contrasting story band", () => {
    const liveDemo = readComponent("homepage-live-demo.tsx");
    const proof = readComponent("homepage-product-proof.tsx");

    expect(liveDemo).not.toContain('tone="inverse"');
    expect(proof).toContain('tone="inverse"');
    expect(liveDemo).toContain("proof.demoEyebrow");
    expect(liveDemo).toContain("proof.demoTitle");
    expect(liveDemo).toContain("proof.demoDescription");
  });

  it("authors page-specific visuals from the approved native fixture layer", () => {
    const visuals = readComponent("homepage-story-visuals.tsx");

    expect(visuals).toContain("native-visual-primitives");
    expect(visuals).toContain("native-fixtures");
    expect(visuals).toContain('VISUAL_PROVIDER_SET_FIXTURES["unified-inbox"]');
    expect(visuals).toContain('provider="claude"');
    for (const provider of ["chatgpt", "claude", "cursor", "gemini"]) {
      expect(visuals).toContain(`provider: "${provider}"`);
    }
    expect(visuals).toContain("M320 225 H350");
    expect(visuals).toContain("M300 76 V243");
    expect(visuals).toContain("COMPOUND_CONNECTOR_STROKE");
    expect(
      visuals.match(/stroke=\{COMPOUND_CONNECTOR_STROKE\}/gu),
    ).toHaveLength(2);
    expect(visuals).not.toContain('strokeOpacity="0.36"');
    expect(visuals).toContain('"flex h-10 items-center py-2"');
    expect(visuals).not.toContain('<span aria-hidden className="mt-1 h-1" />');
    expect(visuals).toContain("ProviderIdentity");
    expect(visuals).toContain("activeConversation.localizedSubject[locale]");
    expect(visuals).toContain(
      "desktop: { node: [220, 552], target: [365, 505] }",
    );
    expect(visuals).toContain(
      "desktop: { node: [780, 552], target: [635, 505] }",
    );
    expect(visuals).toContain(
      "mobile: { node: [300, 55], target: [300, 205] }",
    );
    expect(visuals).toContain("style={orbitPositionStyle(orbitNode)}");
    expect(visuals).toContain('strokeLinecap="butt"');
    expect(visuals).not.toContain("strokeDasharray");
  });

  it("runs horizontal rules to the edges of their owning surfaces", () => {
    const benefits = readComponent("homepage-benefits.tsx");
    const hero = readComponent("homepage-hero.tsx");
    const strip = readComponent("homepage-stats-row.tsx");

    expect(
      componentSource.match(/data-homepage-rules="full-bleed"/gu)?.length,
    ).toBeGreaterThanOrEqual(7);
    expect(benefits).toContain(
      '<section className="relative w-full border-y border-border" id="facts">',
    );
    expect(benefits).toContain("lg:grid-cols-5");
    expect(benefits).not.toContain("absolute inset-x-0 top-1/2");
    for (const figure of [
      'figure: "5"',
      "figure: MCP",
      "figure: AGPL-3.0",
      "figure: EU",
      "figure: DE",
    ]) {
      expect(englishHomepage).toContain(figure);
    }
    expect(benefits).not.toContain("grid grid-cols-2 border-y border-border");
    expect(strip).toContain('className="w-full border-y border-border"');
    expect(hero).toContain(
      'className="relative isolate w-full overflow-hidden"',
    );
    expect(hero).toContain('data-homepage-section="hero"');
    expect(page).toContain('data-marketing-flow="continuous"');
    expect(globalStyles).toMatch(
      /\[data-marketing-flow="continuous"\]\s+\.marketing-section:not/u,
    );
  });

  it("keeps display typography neutral while reserving accent for signals and actions", () => {
    const hero = readComponent("homepage-hero.tsx");
    const walkthrough = readComponent("homepage-walkthrough.tsx");

    expect(hero).not.toMatch(/<h1[\s\S]{0,500}text-primary/u);
    expect(hero).toContain('className="text-hero mt-7 max-w-6xl"');
    expect(hero).not.toContain("text-[clamp(");
    expect(walkthrough).not.toMatch(/<h2[\s\S]{0,240}text-primary/u);
  });

  it("shows four authorable AI-client identities and a distinct n8n automation identity", () => {
    const strip = readComponent("homepage-stats-row.tsx");

    for (const provider of ["chatgpt", "claude", "cursor", "gemini"]) {
      expect(strip).toContain(`"${provider}"`);
    }
    expect(strip).toContain("NativeAutomationProviderIdentity");
    expect(strip).toContain('provider="n8n"');
    expect(strip).toContain("HomepageStatsRow.automationLabel");
    expect(strip).not.toMatch(/codex/iu);
  });

  it("uses the shared 80rem marketing shell and exactly one inverse story band", () => {
    expect(componentSource).not.toMatch(
      /max-w-\[(?:1100|1200|1240|1400|1440)px\]/u,
    );
    expect(componentSource.match(/tone="inverse"/gu)).toHaveLength(1);
    expect(componentSource).toMatch(/MarketingContainer|MarketingSection/u);
  });

  it("recomposes illustrations for narrow and split placements without an outer border", () => {
    const visuals = readComponent("homepage-story-visuals.tsx");
    const artboard = readFileSync(
      join(
        REPO_ROOT,
        "components",
        "marketing",
        "visuals",
        "visual-artboard.tsx",
      ),
      "utf8",
    );

    expect(visuals).toContain("aspect-[4/5]");
    expect(visuals).toContain("sm:aspect-[8/5]");
    expect(visuals).toContain("MarketingVisualArtboard");
    expect(artboard).toContain("overflow-hidden rounded-xl bg-sidebar");
    expect(visuals).toContain(
      'className="absolute inset-0 size-full sm:hidden"',
    );
    expect(visuals).toContain(
      'className="absolute inset-0 hidden size-full sm:block"',
    );
    expect(visuals).not.toMatch(
      /data-homepage-visual=[\s\S]{0,240}border border/u,
    );
  });

  it("keeps pipeline atmosphere behind opaque supporting cards", () => {
    const visuals = readComponent("homepage-story-visuals.tsx");

    expect(visuals).toContain("brightness-75 saturate-50");
    expect(visuals).toContain("brightness-[0.7] saturate-50");
    expect(visuals).toContain("brightness-50 saturate-50");
    expect(visuals).not.toMatch(
      /w-\[(?:25|26|27)%\][^\n]*opacity-(?:35|40|45)/u,
    );
  });
});
