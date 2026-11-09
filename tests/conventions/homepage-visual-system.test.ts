import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

import { ASSET_LOCALES } from "@/i18n/locale-registry";

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

const page = readFileSync(join(HOMEPAGE_ROOT, "page.tsx"), "utf8");
const components = [
  "homepage-capture-image.tsx",
  "homepage-closing.tsx",
  "homepage-follow-up-desk.tsx",
  "homepage-follow-up.tsx",
  "homepage-hero.tsx",
  "homepage-pillars.tsx",
  "homepage-plans.tsx",
  "homepage-product-stage.tsx",
  "homepage-proof-partners.tsx",
  "homepage-viewport-video.tsx",
  "homepage-workspace-generator.tsx",
].map(readComponent);
const componentSource = components.join("\n");
const captureNames = Object.keys(HOMEPAGE_CAPTURES) as HomepageCaptureName[];

describe("homepage visual-system adoption", () => {
  it("tells the follow-up story in a fixed order with the film right under the hero", () => {
    const order = [
      "<HomepageHero",
      "<ProductFilm",
      "<UseCasesSection",
      "<HomepageWorkspaceGenerator",
      "<HomepageFollowUp",
      "<HomepagePillars",
      "<HomepageProofPartners",
      "<HomepagePlans",
      "<HomepageFaq",
      "<HomepageClosing",
    ];

    for (const [index, marker] of order.entries()) {
      expect(page.match(new RegExp(marker, "gu")), marker).toHaveLength(1);
      if (index > 0) expect(page.indexOf(order[index - 1]), marker).toBeLessThan(page.indexOf(marker));
    }

    expect(page).not.toMatch(/HomepageClipTerminal|FeatureSection|visualLabels|HomepageStatsRow|HomepageBenefits/u);
    expect(existsSync(join(COMPONENT_ROOT, "homepage-story-visuals.tsx"))).toBe(false);
    expect(existsSync(join(COMPONENT_ROOT, "homepage-hero-visual.tsx"))).toBe(false);
    expect(existsSync(join(COMPONENT_ROOT, "rotating-accent.tsx"))).toBe(false);
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
        captureNames.flatMap((name) => ASSET_LOCALES.map((locale) => `${name}-${locale}.png`)).sort(),
      );

      for (const name of captureNames) {
        const evidence = HOMEPAGE_CAPTURE_EVIDENCE[name];

        expect(evidence.route, name).toMatch(/^\/\[locale\]\//u);
        expect(evidence.scenario.length, name).toBeGreaterThan(20);

        for (const locale of ASSET_LOCALES) {
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
    const solutionStage = readComponent("solution-product-stage.tsx");
    const stage = readComponent("homepage-product-stage.tsx");

    expect(solutionStage).toContain("<HomepageProductStage");
    expect(readFileSync(join(process.cwd(), "components/marketing/marketing-hero.tsx"), "utf8").match(/<h1\b/gu)).toHaveLength(1);
    expect(readComponent("homepage-hero.tsx")).toContain("<MarketingHero");
    expect(stage).toContain("PRODUCT_STAGE_INTERVAL_MS = 6_000");
    expect(stage).toContain("useHomepageMotion<HTMLDivElement>()");
    expect(stage).toContain("const autoAdvance = shouldAnimate && !stopped && !hovered;");
    expect(stage).toContain("window.matchMedia?.(LIVE_STAGE_MEDIA)");
    expect(solutionStage).toContain("demoBaseUrl={homepageDemoBaseUrl()}");
    expect(stage).toContain('role="tablist"');
    expect(stage).toContain('role="tab"');
    expect(stage).toContain('role="tabpanel"');
    expect(stage).toContain("aria-selected={isActive}");
    expect(stage).toContain("inert={index !== activeIndex}");
    expect(stage).toContain("tabIndex={index === activeIndex ? 0 : -1}");
    expect(stage).toContain("index === activeIndex || loadedTabs.has(index)");
    expect(stage).toContain("onFocus={stopOnVisitorFocus}");
    expect(stage).toContain("if (event.target instanceof HTMLIFrameElement && !hovered) return;");
    expect(stage).toContain("onMouseEnter={() => setHovered(true)}");
    expect(stage).toContain("list.scrollTo(");
    expect(stage).not.toContain("scrollIntoView");
    expect(stage).toContain('mobileSizes="19rem"');
    expect(stage).toContain("autoAdvance && !shouldReduceMotion");
    expect(stage).not.toContain("aria-live");
    expect(stage).toContain("eager={index === 0}");
    expect(stage).toContain("if (window.matchMedia?.(LIVE_STAGE_MEDIA).matches) setLive(true);");
    expect(stage).not.toContain("glass-surface pointer-events-none absolute");
    expect(stage).toContain("STAGE_MAX_TILT_DEG = 12");
    expect(stage).toContain("STAGE_MIN_SCALE = 0.94");
    expect(stage).toContain("lg:[transform:rotateX(var(--stage-tilt,0deg))_scale(var(--stage-scale,1))]");
    expect(stage).toContain('frame.closest("[data-public-scrollport]") ?? window');
    expect(stage).not.toMatch(/MousePointerClick|onPointerEnter=\{goLive\}/u);
    expect(motionSource).toContain("HOMEPAGE_MOTION_VISIBILITY_AMOUNT = 0.35");
    expect(motionSource).toContain("useInView");
    expect(motionSource).toContain("useReducedMotion");
    expect(motionSource).toContain('document.visibilityState === "visible"');
    expect(motionSource).toContain('document.addEventListener("visibilitychange"');
  });

  it("opens with one plain centered claim, a trial call to action and the film link", () => {
    const hero = readComponent("homepage-hero.tsx");
    const sharedHero = readFileSync(join(process.cwd(), "components/marketing/marketing-hero.tsx"), "utf8");

    expect(sharedHero).toContain("mk-enter mx-auto flex max-w-[60rem] flex-col items-center text-center");
    expect(readOpeningElementContaining(sharedHero, 'className="mk-hero mt-4"')).not.toContain("text-primary");
    expect(hero).toContain("primary={heroSection.primaryCta}");
    expect(hero).toContain("secondary={{ ...heroSection.secondaryCta, play: true }}");
    expect(hero).not.toMatch(/RotatingAccent|GridPattern|titleRotations/u);
    expect(englishHomepage).toContain('href: "#film"');
    expect(germanHomepage).toContain('href: "#film"');
    expect(englishHomepage).toContain("job=followup");
  });

  it("shows prompt-to-workspace scenes and the follow-up desk in both locales without em dashes", () => {
    const generator = readComponent("homepage-workspace-generator.tsx");

    expect(generator).toContain("<SolutionProductStage");
    expect(generator).toContain("<HomepageWorkspaceTabs");
    for (const mdx of [englishHomepage, germanHomepage]) {
      expect(mdx).toContain("\ngenerator:\n");
      expect(mdx).toContain("\nfollowUp:\n");
      for (const solution of ["consultants", "agencies", "smb", "freelancers"]) {
        expect(mdx).toContain(`solution: ${solution}`);
      }
      expect(mdx).not.toContain("\u2014");
      expect(mdx).not.toMatch(/titleAccentRotations|illustration:|visualLabels/u);
    }
  });

  it("does not ship the local marketing-preview authentication bypass", () => {
    expect(previewBoundarySource).not.toContain("marketing-preview");
  });

  it("autoplays the walkthrough only while it is meaningfully visible", () => {
    const viewportVideo = readComponent("homepage-viewport-video.tsx");

    expect(viewportVideo).toContain("IntersectionObserver");
    expect(viewportVideo).toContain("AUTOPLAY_VISIBILITY_THRESHOLD = HOMEPAGE_MOTION_VISIBILITY_AMOUNT");
    expect(motionSource).toContain("HOMEPAGE_MOTION_VISIBILITY_AMOUNT = 0.35");
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
    const proof = readFileSync(join(REPO_ROOT, "components", "marketing", "product-film.tsx"), "utf8");
    const viewportVideo = readComponent("homepage-viewport-video.tsx");
    const hero = readComponent("homepage-hero.tsx");

    expect(existsSync(join(COMPONENT_ROOT, "homepage-live-demo.tsx"))).toBe(false);
    expect(existsSync(join(COMPONENT_ROOT, "hero-demo-iframe.tsx"))).toBe(false);
    expect(componentSource.match(/<iframe\b/gu)).toHaveLength(1);
    expect(stage).toContain("id={PRODUCT_DEMO_ANCHOR}");
    expect(stage).toContain('sandbox="allow-scripts allow-same-origin allow-popups allow-forms"');
    expect(stage).toContain("agentChat=closed");
    expect(stage).toContain('window.addEventListener("hashchange", openFromHash)');
    expect(stage).toContain("window.addEventListener(STAGE_OPEN_EVENT, openFromEvent)");
    expect(link).toContain("href={`#${PRODUCT_DEMO_ANCHOR}`}");
    expect(link).toContain("window.dispatchEvent(new CustomEvent<HomepageStageArea>(STAGE_OPEN_EVENT");
    expect(proof).not.toMatch(/tone=/u);
    expect(proof.match(/<HomepageViewportVideo\b/gu)).toHaveLength(1);
    expect(proof).not.toMatch(/<iframe\b/u);
    expect(viewportVideo.match(/<video\b/gu)).toHaveLength(1);
    expect(hero).not.toMatch(/<iframe\b/u);
  });

  it("frames every product capture in one window language on a lit panel", () => {
    const stage = readComponent("homepage-product-stage.tsx");
    const productWindow = readFileSync(join(REPO_ROOT, "components", "marketing", "product-window.tsx"), "utf8");

    expect(stage).toContain("<ProductWindow");
    expect(stage).toContain("LIVE_REVEAL_DELAY_MS = 500");
    expect(stage).toContain("onLoad={() => revealLive(index)}");
    expect(stage).toContain("live && liveMounted.has(index)");
    expect(productWindow).not.toContain("data-homepage-window-chrome");
    expect(stage).toContain("LIVE_VIEWPORT = { maxWidth: 1440, minScale: 0.8, minWidth: 1120, ratio: 1.6 }");
    expect(stage).toContain('inbox: "/inbox?threadId=latest"');
    expect(productWindow).toContain("data-homepage-panel");
    expect(productWindow).toContain("data-homepage-phone");
    expect(productWindow).toContain("data-reveal");
    expect(globalStyles).toContain("animation-timeline: view();");
    expect(globalStyles).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s+\[data-reveal\]/u);
    expect(componentSource).not.toMatch(/bg-primary\/20 blur-3xl/u);
  });

  it("keeps the homepage in one continuous marketing flow", () => {
    expect(page).toContain('data-marketing-flow="continuous"');
    expect(globalStyles).toMatch(/\.marketing-section\[data-marketing-divider="explicit"\]\s*\{/u);
  });

  it("uses the shared 80rem marketing shell and no inverted band", () => {
    expect(componentSource).not.toMatch(/max-w-\[(?:1100|1200|1240|1400|1440)px\]/u);
    expect(componentSource).not.toMatch(/inverse/u);
    expect(componentSource).toMatch(/MarketingContainer|MarketingSection/u);
  });
});
