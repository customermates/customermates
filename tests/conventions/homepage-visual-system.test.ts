import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

import { CONTENT_LOCALES } from "@/i18n/locale-registry";

import {
  HOMEPAGE_CAPTURE_EVIDENCE,
  HOMEPAGE_CAPTURE_PROVENANCE,
} from "@/app/[locale]/(static)/components/homepage-capture-provenance";
import { HOMEPAGE_CAPTURES, type HomepageCaptureName } from "@/app/[locale]/(static)/components/homepage-captures";

const HOMEPAGE_ROOT = join(REPO_ROOT, "app", "[locale]", "(static)");
const COMPONENT_ROOT = join(HOMEPAGE_ROOT, "components");
const CAPTURE_ROOT = join(REPO_ROOT, "public", "captures");
const globalStyles = readFileSync(join(REPO_ROOT, "styles", "globals.css"), "utf8");
const englishHomepage = readFileSync(join(REPO_ROOT, "content", "homepage", "en", "homepage.mdx"), "utf8");
const germanHomepage = readFileSync(join(REPO_ROOT, "content", "homepage", "de", "homepage.mdx"), "utf8");
const motionSource = readFileSync(join(COMPONENT_ROOT, "homepage-motion.ts"), "utf8");
const previewBoundarySource = [
  readFileSync(join(REPO_ROOT, "proxy.ts"), "utf8"),
  readFileSync(join(REPO_ROOT, "app", "components", "navigation", "navigation-switch.tsx"), "utf8"),
].join("\n");

function readComponent(file: string) {
  return readFileSync(join(COMPONENT_ROOT, file), "utf8");
}

function readOpeningElementContaining(source: string, marker: string) {
  const markerIndex = source.indexOf(marker);
  const elementStart = source.lastIndexOf("<", markerIndex);
  const elementEnd = source.indexOf(">", markerIndex);

  if (markerIndex < 0 || elementStart < 0 || elementEnd < 0) {
    throw new Error(`${marker} must remain on an opening element`);
  }

  return source.slice(elementStart, elementEnd + 1);
}

function pngDimensions(file: Buffer) {
  return { height: file.readUInt32BE(20), width: file.readUInt32BE(16) };
}

function stageCaptures(mdx: string) {
  const stage = mdx.slice(mdx.indexOf("  stage:\n"), mdx.indexOf("\nflow:\n"));
  return [...stage.matchAll(/^ {6}- capture: ([a-z-]+)$/gmu)].map(([, capture]) => capture);
}

function altTexts(mdx: string) {
  return [...mdx.matchAll(/^\s+(?:alt|desktopAlt|phoneAlt): (.*)$/gmu)].map(([, alt]) => alt);
}

const page = readFileSync(join(HOMEPAGE_ROOT, "page.tsx"), "utf8");
const components = [
  "homepage-benefits.tsx",
  "homepage-capture-image.tsx",
  "homepage-closing.tsx",
  "homepage-hero.tsx",
  "homepage-how-it-works.tsx",
  "homepage-pipeline.tsx",
  "homepage-pricing.tsx",
  "homepage-product-proof.tsx",
  "homepage-product-stage.tsx",
  "homepage-routines.tsx",
  "homepage-stage-link.tsx",
  "homepage-stats-row.tsx",
  "homepage-story.tsx",
  "homepage-viewport-video.tsx",
  "homepage-walkthrough.tsx",
].map(readComponent);
const componentSource = components.join("\n");
const captureNames = Object.keys(HOMEPAGE_CAPTURES) as HomepageCaptureName[];

describe("homepage visual-system adoption", () => {
  it("tells the story in a fixed order with real product proof instead of drawn illustrations", () => {
    const order = [
      "<HomepageHero",
      "<HomepageFacts",
      "<HomepageStory",
      "<HomepageStatsRow",
      "<HomepageWalkthrough",
      "<HomepageHowItWorks",
      "<HomepagePipeline",
      "<HomepageRoutines",
      "<HomepageProductProof",
      "<HomepageBenefits",
      "<HomepagePricing",
      "<HomepageFaq",
      "<HomepageClosing",
    ];

    for (const [index, marker] of order.entries()) {
      expect(page.match(new RegExp(marker, "gu")), marker).toHaveLength(1);
      if (index > 0) expect(page.indexOf(order[index - 1]), marker).toBeLessThan(page.indexOf(marker));
    }

    expect(page).not.toMatch(/HomepageClipTerminal|FeatureSection|visualLabels/u);
    expect(componentSource).not.toMatch(/homepage-story-visuals|homepage-hero-visual|RotatingAccent/u);
    expect(componentSource).not.toMatch(/GoldenStoryVisual|GOLDEN_LAYOUT|MarketingVisualArtboard/u);
    expect(existsSync(join(COMPONENT_ROOT, "homepage-story-visuals.tsx"))).toBe(false);
    expect(existsSync(join(COMPONENT_ROOT, "homepage-hero-visual.tsx"))).toBe(false);
  });

  it("ships every registered capture as an unedited still with pinned provenance", () => {
    expect(HOMEPAGE_CAPTURE_PROVENANCE.authenticity).toBe("real");
    expect(HOMEPAGE_CAPTURE_PROVENANCE.productRef).toMatch(/^[0-9a-f]{9,40}$/u);
    expect(HOMEPAGE_CAPTURE_PROVENANCE.environment).toContain("APP_MODE=demo");
    expect(HOMEPAGE_CAPTURE_PROVENANCE.environment).toContain("prisma db seed");
    expect(HOMEPAGE_CAPTURE_PROVENANCE.claim).toContain("synthetic demo data");
    expect(Object.keys(HOMEPAGE_CAPTURE_EVIDENCE).sort()).toEqual([...captureNames].sort());

    for (const theme of ["dark", "light"] as const) {
      const shipped = readdirSync(join(CAPTURE_ROOT, theme)).sort();
      expect(shipped, theme).toEqual(
        captureNames.flatMap((name) => CONTENT_LOCALES.map((locale) => `${name}-${locale}.png`)).sort(),
      );

      for (const name of captureNames) {
        const evidence = HOMEPAGE_CAPTURE_EVIDENCE[name];

        expect(evidence.route, name).toMatch(/^\/\[locale\]\//u);
        expect(evidence.scenario.length, name).toBeGreaterThan(20);

        for (const locale of CONTENT_LOCALES) {
          const file = readFileSync(join(CAPTURE_ROOT, theme, `${name}-${locale}.png`));

          expect(createHash("sha256").update(new Uint8Array(file)).digest("hex"), `${theme}/${name}-${locale}`).toBe(
            evidence.sha256[locale][theme],
          );
          expect(pngDimensions(file), `${theme}/${name}-${locale}`).toEqual(HOMEPAGE_CAPTURES[name][locale]);
        }
      }
    }
  });

  it("keeps capture evidence out of the client bundle", () => {
    expect(readComponent("homepage-captures.ts")).not.toMatch(/sha256|scenario|[0-9a-f]{64}/u);
    expect(componentSource).not.toContain("homepage-capture-provenance");
  });

  it("renders captures in both themes and swaps to phone captures on small screens", () => {
    const image = readComponent("homepage-capture-image.tsx");

    expect(image).toContain('{ className: "dark:hidden", theme: "light" }');
    expect(image).toContain('{ className: "not-dark:hidden", theme: "dark" }');
    expect(image).toContain("getImageProps");
    expect(image).toContain('media="(min-width: 40rem)"');
    expect(image).toContain('const loading = eager ? "eager" : "lazy";');
    expect(image).toContain("homepageCaptureSrc(name, locale, theme)");
    expect(image).toContain("homepageCaptureSrc(mobileName, locale, theme)");
    expect(image).toContain("HOMEPAGE_CAPTURES[name][locale]");
    expect(image).not.toMatch(/max-sm:hidden|"sm:hidden"/u);
    expect(componentSource).not.toMatch(/<iframe\b[\s\S]{0,400}captures/u);
  });

  it("runs the product stage as an accessible tab set that only advances while appropriate", () => {
    const hero = readComponent("homepage-hero.tsx");
    const stage = readComponent("homepage-product-stage.tsx");

    expect(hero).toContain("<HomepageProductStage");
    expect(hero.match(/<h1\b/gu)).toHaveLength(1);
    expect(stage).toContain("PRODUCT_STAGE_INTERVAL_MS = 6_000");
    expect(stage).toContain("useHomepageMotion<HTMLDivElement>()");
    expect(stage).toContain("const autoAdvance = shouldAnimate && !stopped && !hovered && !live;");
    expect(stage).toContain("window.matchMedia?.(LIVE_STAGE_MEDIA)");
    expect(hero).toContain("demoBaseUrl={homepageDemoBaseUrl()}");
    expect(stage).toContain('role="tablist"');
    expect(stage).toContain('role="tab"');
    expect(stage).toContain('role="tabpanel"');
    expect(stage).toContain("aria-selected={isActive}");
    expect(stage).toContain("inert={index !== activeIndex}");
    expect(stage).toContain("tabIndex={index === activeIndex ? 0 : -1}");
    expect(stage).toContain("index === activeIndex || loadedTabs.has(index)");
    expect(stage).toContain("onFocus={() => setStopped(true)}");
    expect(stage).toContain("onMouseEnter={() => setHovered(true)}");
    expect(stage).toContain("list.scrollTo(");
    expect(stage).not.toContain("scrollIntoView");
    expect(stage).toContain('mobileSizes="19rem"');
    expect(stage).toContain("autoAdvance && !shouldReduceMotion");
    expect(stage).not.toContain("aria-live");
    expect(stage).toContain("eager={index === 0}");
    expect(motionSource).toContain("HOMEPAGE_MOTION_VISIBILITY_AMOUNT = 0.35");
    expect(motionSource).toContain("useInView");
    expect(motionSource).toContain("useReducedMotion");
    expect(motionSource).toContain('document.visibilityState === "visible"');
    expect(motionSource).toContain('document.addEventListener("visibilitychange"');
  });

  it("keeps the display headings neutral inside the split hero", () => {
    const hero = readComponent("homepage-hero.tsx");
    const walkthrough = readComponent("homepage-walkthrough.tsx");

    expect(readOpeningElementContaining(hero, 'data-homepage-hero-line="lead"')).not.toContain("text-primary");
    expect(walkthrough).not.toMatch(/<h2[\s\S]{0,240}text-primary/u);
    expect(hero).toContain("GridPattern");
    expect(hero).toContain("heroSection.useCase");
    expect(hero).toContain("lg:grid-cols-[1.2fr_1fr]");
  });

  it("localizes the stage, alt texts and disclosure in both locales", () => {
    const expected = [
      "homepage-inbox",
      "homepage-record",
      "homepage-pipeline",
      "homepage-dashboard",
      "homepage-routines",
    ];

    expect(stageCaptures(englishHomepage)).toEqual(expected);
    expect(stageCaptures(germanHomepage)).toEqual(expected);
    expect(englishHomepage).toContain("People, companies and numbers are sample data.");
    expect(germanHomepage).toContain("Personen, Unternehmen und Zahlen sind Beispieldaten.");
    expect(englishHomepage).toContain("  disclosure: Sample data from the Customermates demo workspace.");
    expect(germanHomepage).toContain("  disclosure: Beispieldaten aus dem Demo-Arbeitsbereich von Customermates.");
    expect(readComponent("homepage-pipeline.tsx")).toContain("{story.disclosure}");
    expect(altTexts(englishHomepage)).toHaveLength(11);
    expect(altTexts(germanHomepage)).toHaveLength(11);
    for (const alt of altTexts(englishHomepage)) expect(alt).toMatch(/, using demo data$/u);
    for (const alt of altTexts(germanHomepage)) expect(alt).toMatch(/, mit Beispieldaten$/u);
    expect(englishHomepage).not.toContain("—");
    expect(germanHomepage).not.toContain("—");
    expect(englishHomepage).not.toMatch(/titleAccentRotations|illustration:|visualLabels/u);
    expect(germanHomepage).not.toMatch(/titleAccentRotations|illustration:|visualLabels/u);
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

  it("keeps one live workspace in the product stage and links every capture to it", () => {
    const stage = readComponent("homepage-product-stage.tsx");
    const link = readComponent("homepage-stage-link.tsx");
    const proof = readComponent("homepage-product-proof.tsx");
    const viewportVideo = readComponent("homepage-viewport-video.tsx");
    const hero = readComponent("homepage-hero.tsx");

    expect(existsSync(join(COMPONENT_ROOT, "homepage-live-demo.tsx"))).toBe(false);
    expect(existsSync(join(COMPONENT_ROOT, "hero-demo-iframe.tsx"))).toBe(false);
    expect(componentSource.match(/<iframe\b/gu)).toHaveLength(1);
    expect(stage).toContain("id={PRODUCT_DEMO_ANCHOR}");
    expect(stage).toContain('sandbox="allow-scripts allow-same-origin allow-popups allow-forms"');
    expect(stage).toContain("?agentChat=closed");
    expect(stage).toContain('window.addEventListener("hashchange", openFromHash)');
    expect(stage).toContain("window.addEventListener(STAGE_OPEN_EVENT, openFromEvent)");
    expect(link).toContain("href={`#${PRODUCT_DEMO_ANCHOR}`}");
    expect(link).toContain("window.dispatchEvent(new CustomEvent<HomepageStageArea>(STAGE_OPEN_EVENT");
    for (const file of [
      "homepage-walkthrough.tsx",
      "homepage-how-it-works.tsx",
      "homepage-pipeline.tsx",
      "homepage-routines.tsx",
    ]) {
      const source = readComponent(file);
      expect(source.match(/<HomepageCaptureImage\b/gu)?.length, file).toBe(source.match(/<HomepageStageLink\b/gu)?.length);
    }
    expect(englishHomepage).toContain('buttonRightHref: "#product-demo"');
    expect(germanHomepage).toContain('buttonRightHref: "#product-demo"');
    expect(proof).toContain('tone="inverse"');
    expect(proof.match(/<HomepageViewportVideo\b/gu)).toHaveLength(1);
    expect(proof).not.toMatch(/<iframe\b/u);
    expect(viewportVideo.match(/<video\b/gu)).toHaveLength(1);
    expect(hero).not.toMatch(/<iframe\b/u);
  });

  it("runs horizontal rules to the edges of their owning surfaces", () => {
    const benefits = readComponent("homepage-benefits.tsx");
    const hero = readComponent("homepage-hero.tsx");
    const strip = readComponent("homepage-stats-row.tsx");

    expect(componentSource.match(/data-homepage-rules="full-bleed"/gu)?.length).toBeGreaterThanOrEqual(6);
    expect(benefits).toContain('<section className="relative w-full border-y border-border" id="facts">');
    expect(benefits).toContain("lg:grid-cols-5");
    expect(benefits).not.toContain("absolute inset-x-0 top-1/2");
    expect(benefits).not.toContain("grid grid-cols-2 border-y border-border");
    for (const figure of ['figure: "5"', "figure: MCP", "figure: AGPL-3.0", "figure: EU", "figure: DE"]) {
      expect(englishHomepage).toContain(figure);
    }
    expect(strip).toContain('className="w-full border-y border-border"');
    expect(hero).toContain('className="relative isolate w-full overflow-hidden"');
    expect(hero).toContain('data-homepage-section="hero"');
    expect(page).toContain('data-marketing-flow="continuous"');
    expect(globalStyles).toMatch(/\[data-marketing-flow="continuous"\]\s+\.marketing-section:not/u);
  });

  it("shows five authorable AI-client identities and a distinct n8n automation identity", () => {
    const strip = readComponent("homepage-stats-row.tsx");

    for (const provider of ["chatgpt", "claude", "cursor", "gemini", "grok"]) {
      expect(strip).toContain(`"${provider}"`);
    }
    expect(strip).toContain("NativeAutomationProviderIdentity");
    expect(strip).toContain('provider="n8n"');
    expect(strip).toContain("HomepageStatsRow.automationLabel");
    expect(strip).not.toMatch(/codex/iu);
  });

  it("uses the shared 80rem marketing shell and exactly one inverse story band", () => {
    expect(componentSource).not.toMatch(/max-w-\[(?:1100|1200|1240|1400|1440)px\]/u);
    expect(componentSource.match(/tone="inverse"/gu)).toHaveLength(1);
    expect(componentSource).toMatch(/MarketingContainer|MarketingSection/u);
  });
});
