import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

const HOMEPAGE_ROOT = join(REPO_ROOT, "app", "[locale]", "(static)");
const COMPONENT_ROOT = join(HOMEPAGE_ROOT, "components");
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

function parseLiteralKeyframes(values: string) {
  return values
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => (value.startsWith('"') ? JSON.parse(value) : Number(value))) as Array<number | string>;
}

function readLiteralKeyframes(source: string, constantName: string) {
  const declaration = source.match(
    new RegExp(`const ${constantName}\\s*=\\s*\\[([\\s\\S]*?)\\](?:\\s+(?:as const|satisfies [^;]+))?;`, "u"),
  );

  if (!declaration) {
    throw new Error(`${constantName} must remain an authored literal keyframe array`);
  }

  return parseLiteralKeyframes(declaration[1]);
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
  "rotating-accent.tsx",
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
    expect(liveDemo).toContain("const demoPath = `/${locale}/dashboard?agentChat=open`");
    expect(liveDemo).not.toMatch(/inbox|threadId|DEMO_INBOX_THREAD_ID/u);
    expect(hero).not.toMatch(/HeroDemoIframe|<iframe\b/u);
    expect(proof.match(/<HomepageViewportVideo\b/gu)).toHaveLength(1);
    expect(viewportVideo.match(/<video\b/gu)).toHaveLength(1);
    expect(proof).not.toMatch(/HeroDemoIframe|<iframe\b/u);
    expect(page.indexOf("<HomepageHero")).toBeLessThan(page.indexOf("<HomepageLiveDemo"));
    expect(page.indexOf("<HomepageLiveDemo")).toBeLessThan(page.indexOf("<HomepageProductProof"));
    expect(page.indexOf("<HomepageProductProof")).toBeLessThan(page.indexOf("<HomepageStatsRow"));
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
    expect(hero).not.toMatch(/HomepageAgentRecordVisual|GoogleCalendar|OutlookCalendar|Messenger|XTwitter/u);
    expect(englishHomepage).toContain("title: The open-source CRM");
    expect(englishHomepage).toContain("titleAccent: for AI agents.");
    expect(hero).toContain("heroSection.useCaseEyebrow");
    expect(hero).toContain("heroSection.useCase");
  });

  it("rotates a width-reserved, accessible hero reel only while motion is appropriate", () => {
    const hero = readComponent("homepage-hero.tsx");
    const rotatingAccent = readComponent("rotating-accent.tsx");
    const leadLine = readOpeningElementContaining(hero, 'data-homepage-hero-line="lead"');
    const rotationLine = readOpeningElementContaining(hero, 'data-homepage-hero-line="rotation"');

    expect(hero).toContain("accessibleHeadline");
    expect(hero).toContain("[heroSection.title, accentRotations[0]]");
    expect(hero).toContain('className="sr-only"');
    expect(hero).toContain("<RotatingAccent");
    expect(hero.match(/data-homepage-hero-line="lead"/gu)).toHaveLength(1);
    expect(hero.match(/data-homepage-hero-line="rotation"/gu)).toHaveLength(1);
    expect(hero.indexOf('data-homepage-hero-line="lead"')).toBeLessThan(
      hero.indexOf('data-homepage-hero-line="rotation"'),
    );
    expect(hero).toContain("gap-y-[0.1em] lg:gap-y-[0.06em]");
    expect(leadLine).toContain("whitespace-nowrap");
    expect(rotationLine).toContain("whitespace-nowrap");
    expect(rotatingAccent).toContain("AnimatePresence");
    expect(rotatingAccent).toContain("ROTATION_INTERVAL_MS = 2_600");
    expect(rotatingAccent).toContain("ROTATION_DURATION_SECONDS = 0.2");
    expect(rotatingAccent).toContain("relative inline-grid max-w-full overflow-hidden");
    expect(rotatingAccent).toContain("invisible col-start-1 row-start-1 whitespace-nowrap");
    expect(rotatingAccent).toContain('className={cn("inline-block", activeClassName)}');
    expect(rotatingAccent).toContain('data-homepage-motion="rotating-accent"');
    expect(rotatingAccent).not.toContain("aria-live");
    expect(rotatingAccent).toContain("useHomepageMotion<HTMLSpanElement>(0.6)");
    expect(hero).toContain('activeClassName="rounded-xl bg-primary/10 px-[0.12em]"');
    expect(hero).toContain('className="p-[0.12em] text-primary"');
    expect(motionSource).toContain("HOMEPAGE_MOTION_VISIBILITY_AMOUNT = 0.35");
    expect(motionSource).toContain("useInView");
    expect(motionSource).toContain("useReducedMotion");
    expect(motionSource).toContain('document.visibilityState === "visible"');
    expect(motionSource).toContain('document.addEventListener("visibilitychange"');

    for (const label of [
      "for AI agents.",
      "for Claude.",
      "for ChatGPT.",
      "for Codex.",
      "for Cursor.",
      "for Gemini.",
      "for Hermes Agent.",
      "for OpenClaw.",
      "for n8n.",
    ]) {
      expect(englishHomepage).toContain(`    - ${label}`);
    }

    expect(germanHomepage).toContain("title: Das Open-Source-CRM");
    expect(germanHomepage).toContain("titleAccentRotations:");
    expect(germanHomepage).toContain("    - für KI-Agenten.");
    for (const label of [
      "für Claude.",
      "für ChatGPT.",
      "für Codex.",
      "für Cursor.",
      "für Gemini.",
      "für Hermes Agent.",
      "für OpenClaw.",
      "für n8n.",
    ]) {
      expect(germanHomepage).toContain(`    - ${label}`);
    }
    expect(englishHomepage).toContain("useCaseEyebrow: A real workflow");
    expect(germanHomepage).toContain("useCaseEyebrow: Ein konkreter Ablauf");
  });

  it("keeps the live workspace on-page and gives the walkthrough the contrasting story band", () => {
    const demoIframe = readComponent("hero-demo-iframe.tsx");
    const liveDemo = readComponent("homepage-live-demo.tsx");
    const proof = readComponent("homepage-product-proof.tsx");

    expect(liveDemo).not.toContain('tone="inverse"');
    expect(proof).toContain('tone="inverse"');
    expect(liveDemo).toContain("proof.demoEyebrow");
    expect(liveDemo).toContain("proof.demoTitle");
    expect(liveDemo).toContain("proof.demoDescription");
    expect(liveDemo).toContain('containerSize="wide"');
    expect(liveDemo).toContain('className="marketing-grid mx-auto max-w-[84rem] items-end gap-y-6"');
    expect(liveDemo).toContain('<HeroDemoIframe size="article" src={demoSrc} />');
    expect(demoIframe).toContain('size = "full"');
    expect(demoIframe).toContain("<BrowserFrame size={size}");
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
    for (const provider of ["gmail", "outlook", "imap", "telegram", "linkedin", "whatsapp", "instagram"]) {
      expect(visuals).toContain(`provider: "${provider}"`);
    }
    expect(visuals).toContain("M320 225 H350");
    expect(visuals).toContain("M300 76 V243");
    expect(visuals).toContain("COMPOUND_CONNECTOR_STROKE");
    expect(visuals.match(/stroke=\{COMPOUND_CONNECTOR_STROKE\}/gu)).toHaveLength(2);
    expect(visuals).not.toContain('strokeOpacity="0.36"');
    expect(visuals).not.toContain("h-[3.25rem]");
    expect(visuals).not.toContain('<span aria-hidden className="mt-1 h-1" />');
    expect(visuals).toContain("SyncedSignalPath");
    expect(visuals).not.toContain("<animateMotion");
    expect(visuals).not.toMatch(/HandoffWander|HANDOFF_SIGNAL_WANDER|\bwander:/u);
    expect(visuals).toContain("ProviderIdentity");
    expect(visuals).toContain("activeConversation.localizedSubject[locale]");
    expect(visuals).toContain("desktop: { node: [220, 552], target: [365, 400] }");
    expect(visuals).toContain("desktop: { node: [780, 552], target: [635, 400] }");
    for (const mobileConnector of [
      "mobile: { node: [85, 85], target: [138, 205] }",
      "mobile: { node: [55, 330], target: [126, 330] }",
      "mobile: { node: [160, 660], target: [160, 400] }",
      "mobile: { node: [300, 55], target: [300, 205] }",
      "mobile: { node: [515, 85], target: [462, 205] }",
      "mobile: { node: [545, 330], target: [474, 330] }",
      "mobile: { node: [440, 660], target: [440, 400] }",
    ]) {
      expect(visuals).toContain(mobileConnector);
    }
    expect(visuals).not.toMatch(/target: \[(?:220|380), 460\]/u);
    expect(visuals).toContain("style={orbitPositionStyle(orbitNode)}");
    expect(visuals).toContain('strokeLinecap="butt"');
    expect(visuals).not.toContain("strokeDasharray");
  });

  it("keeps page-specific story loops causal, visibility-gated, and separate from shared primitives", () => {
    const visuals = readComponent("homepage-story-visuals.tsx");

    const omnichannelChoreographyStart = visuals.indexOf("const OMNICHANNEL_SIGNAL_BURSTS");
    const handoffChoreographyStart = visuals.indexOf("const HANDOFF_SIGNAL_SEQUENCE");
    const omnichannelChoreography = visuals.slice(omnichannelChoreographyStart, handoffChoreographyStart);
    const omnichannelSceneDurations = [...omnichannelChoreography.matchAll(/^\s{4}durationMs:\s*([\d_]+),$/gmu)].map(
      ([, duration]) => Number(duration.replaceAll("_", "")),
    );
    const omnichannelSignalDurations = [
      ...omnichannelChoreography.matchAll(/\{\s*delayMs:\s*[\d_]+,\s*durationMs:\s*([\d_]+)/gu),
    ].map(([, duration]) => Number(duration.replaceAll("_", "")));
    const signalTravelTimes = readLiteralKeyframes(visuals, "SIGNAL_TRAVEL_TIMES").map(Number);
    const signalTravelValues = readLiteralKeyframes(visuals, "SIGNAL_TRAVEL_VALUES").map(Number);
    const signalTimelineStart = visuals.indexOf("function useSignalTimeline");
    const syncedSignalPathStart = visuals.indexOf("function SyncedSignalPath");
    const providerSignalRingStart = visuals.indexOf("function ProviderSignalRing");
    const orbitSignalStart = visuals.indexOf("function OrbitSignal");
    const orbitConnectorsStart = visuals.indexOf("function OrbitConnectors");
    const handoffSignalStart = visuals.indexOf("function HandoffSignal");
    const handoffVisualStart = visuals.indexOf("export function HomepageHandoffVisual");
    const pipelineStart = visuals.indexOf("function PipelineCard");
    const pipelineRecordsStart = visuals.indexOf("const PIPELINE_RECORDS");
    const signalTimeline = visuals.slice(signalTimelineStart, syncedSignalPathStart);
    const syncedSignalPath = visuals.slice(syncedSignalPathStart, providerSignalRingStart);
    const providerSignalRing = visuals.slice(providerSignalRingStart, orbitSignalStart);
    const orbitSignal = visuals.slice(orbitSignalStart, orbitConnectorsStart);
    const handoffSignal = visuals.slice(handoffSignalStart, handoffVisualStart);
    const handoffVisual = visuals.slice(handoffVisualStart, pipelineStart);
    const pipelineCard = visuals.slice(pipelineStart, pipelineRecordsStart);
    const providerShell = readOpeningElementContaining(visuals, "data-homepage-provider-shell");
    const providerPingOpening = readOpeningElementContaining(visuals, "data-homepage-provider-ping={provider}");
    const handoffProviderMarker = visuals.indexOf("data-homepage-handoff-provider={provider.provider}");
    const handoffProviderStart = visuals.lastIndexOf("<div", handoffProviderMarker);
    const handoffProviderEnd = visuals.indexOf("</div>", handoffProviderMarker);
    const handoffProviderOpening = readOpeningElementContaining(visuals, "data-homepage-handoff-provider");
    const handoffWrapperStart = visuals.lastIndexOf("<div", handoffProviderStart - 1);
    const handoffWrapperEnd = visuals.indexOf(">", handoffWrapperStart);
    const handoffWrapperOpening = visuals.slice(handoffWrapperStart, handoffWrapperEnd + 1);

    expect(visuals).toContain('"use client"');
    expect(visuals).toContain("useHomepageMotion");
    expect(visuals).toContain("useTimedSceneCycle");
    expect(visuals).toContain("setTimeout");
    expect(visuals).toContain("Number.POSITIVE_INFINITY");
    expect(visuals).toContain("OMNICHANNEL_SIGNAL_BURSTS");
    expect(visuals).toContain("HANDOFF_SIGNAL_SEQUENCE");
    expect(visuals).toMatch(/type OneToThree<T> =[^;]*readonly \[T\][^;]*readonly \[T, T\][^;]*readonly \[T, T, T\]/su);
    expect(visuals).toContain("signals: OneToThree<OmnichannelSignalSpec>");
    expect(visuals).toContain("activeBurst.signals.map");
    expect(omnichannelChoreographyStart).toBeGreaterThanOrEqual(0);
    expect(handoffChoreographyStart).toBeGreaterThan(omnichannelChoreographyStart);
    expect(omnichannelChoreography).toMatch(/signals:\s*\[\s*\{[^}]*provider:[^}]*\}\s*,\s*\{[^}]*provider:/su);
    expect(omnichannelChoreography).toContain("delayMs:");
    expect(omnichannelChoreography).toContain("durationMs:");
    expect(omnichannelChoreography).toContain("ease:");
    expect(omnichannelSceneDurations.length).toBeGreaterThan(0);
    expect(omnichannelSignalDurations.length).toBeGreaterThan(0);
    expect(Math.min(...omnichannelSceneDurations)).toBeGreaterThanOrEqual(2_200);
    expect(Math.min(...omnichannelSignalDurations)).toBeGreaterThanOrEqual(1_400);
    expect(signalTravelValues).toHaveLength(signalTravelTimes.length);
    expect([...new Set(signalTravelValues)]).toEqual([0, 1]);
    expect(signalTravelValues.every((value, index) => index === 0 || value >= signalTravelValues[index - 1])).toBe(
      true,
    );
    expect(signalTimelineStart).toBeGreaterThanOrEqual(0);
    expect(syncedSignalPathStart).toBeGreaterThan(signalTimelineStart);
    expect(providerSignalRingStart).toBeGreaterThan(syncedSignalPathStart);
    expect(orbitSignalStart).toBeGreaterThan(providerSignalRingStart);
    expect(handoffSignalStart).toBeGreaterThan(orbitSignalStart);
    expect(handoffVisualStart).toBeGreaterThan(handoffSignalStart);
    expect(signalTimeline.match(/useMotionValue\(0\)/gu)).toHaveLength(1);
    expect(signalTimeline).toContain("const phase = useMotionValue(0)");
    expect(signalTimeline.match(/\banimate\(phase,\s*1,/gu)).toHaveLength(1);
    expect(signalTimeline).toContain("const travel = useTransform(");
    expect(signalTimeline).toContain("SIGNAL_TRAVEL_TIMES");
    expect(signalTimeline).toContain("SIGNAL_TRAVEL_VALUES");
    expect(syncedSignalPath).toContain("useTransform(timeline.travel");
    expect(syncedSignalPath).toContain("pathRef.current");
    expect(syncedSignalPath).toContain("getTotalLength()");
    expect(syncedSignalPath).toContain("getPointAtLength(");
    expect(syncedSignalPath).toContain("ref={pathRef}");
    expect(syncedSignalPath).toContain("pathLength: timeline.travel");
    expect(syncedSignalPath).toContain("cx={signalX}");
    expect(syncedSignalPath).toContain("cy={signalY}");
    expect(providerSignalRing.match(/useTransform\(\s*timeline\.travel,/gu)).toHaveLength(2);
    expect(providerSignalRing).toContain("style={{ opacity: timeline.activity }}");
    expect(providerSignalRing).toContain("data-homepage-provider-ping={provider}");
    expect(providerSignalRing).toContain("pointer-events-none absolute -inset-1");
    expect(providerSignalRing).toContain("rounded-full border border-primary/70");
    expect(providerPingOpening).toMatch(/^<motion\.span\b/u);
    expect(providerPingOpening).toContain("aria-hidden");
    expect(providerPingOpening).not.toMatch(/\blayout(?:=|\s)|\b(?:m|p)[trblxy]?-/u);
    expect(orbitSignal.match(/<SyncedSignalPath\b/gu)).toHaveLength(2);
    expect(orbitSignal.match(/\buseSignalTimeline\(signal,\s*true\)/gu)).toHaveLength(1);
    expect(orbitSignal.match(/<ProviderSignalRing\b/gu)).toHaveLength(1);
    expect(handoffSignal.match(/<SyncedSignalPath\b/gu)).toHaveLength(1);
    expect(visuals).not.toContain("ORBIT_NODES[0]");
    expect(visuals).not.toContain('shouldAnimate && provider === "chatgpt"');
    expect(visuals).not.toContain('shouldAnimate && status === "deal-won"');
    expect(visuals).not.toMatch(/Math\.random|Date\.now|performance\.now|setInterval/u);
    expect(visuals).toContain("<motion.path");
    expect(visuals).toContain("<motion.circle");
    expect(visuals).toContain("data-homepage-motion-signal=");
    expect(visuals).toContain("data-homepage-provider-shell={orbitNode.provider}");
    expect(providerShell).toMatch(/^<span\b/u);
    expect(providerShell).not.toMatch(/\banimate=|\btransition=|\blayout(?:=|\s)/u);
    expect(visuals).not.toMatch(/PROVIDER_NODE_OPACITY|PROVIDER_NODE_SCALE|PROVIDER_RING_OPACITY/u);
    expect(visuals.match(/<ProviderSignalRing\b/gu)).toHaveLength(2);
    expect(visuals).toContain("data-homepage-handoff-signal=");
    expect(visuals).toContain("data-homepage-handoff-provider={provider.provider}");
    expect(visuals).not.toContain("<animateMotion");
    expect(visuals).not.toMatch(/HandoffWander|HANDOFF_SIGNAL_WANDER|\bwander:/u);
    expect(handoffProviderStart).toBeGreaterThanOrEqual(0);
    expect(handoffProviderEnd).toBeGreaterThan(handoffProviderStart);
    expect(handoffProviderOpening).toMatch(/^<div\b/u);
    expect(handoffProviderOpening).toContain("w-fit max-w-full");
    expect(handoffProviderOpening).not.toMatch(
      /\banimate=|\btransition=|\blayout(?:=|\s)|\bstyle=|(?:^|\s)(?:h|min-h)-/u,
    );
    expect(handoffWrapperOpening).toContain("flex");
    expect(handoffWrapperOpening).toContain("w-[38%]");
    expect(handoffWrapperOpening).toContain("sm:w-[23%]");
    expect(visuals).toContain("justify-end");
    expect(visuals).toContain("justify-start");
    expect(handoffVisual).toMatch(/\{isActive\s*\?\s*(?:\(\s*)?<ProviderSignalRing/u);
    expect(handoffVisual).toContain('className="relative z-10 shrink-0 text-[10px] sm:text-xs"');
    expect(handoffVisual).not.toContain('<span className="relative z-10 shrink-0">');
    expect(visuals).not.toMatch(
      /HANDOFF_TYPING_DOT_INDEXES|createTypingDotTimeline|loaderWidth|loaderMarginLeft|loaderOpacity|data-homepage-handoff-dots/u,
    );
    expect(pipelineRecordsStart).toBeGreaterThan(pipelineStart);
    expect(pipelineCard).not.toMatch(/\bcompact\b|hidden md:(?:inline-flex|grid|flex)/u);
    expect(pipelineCard).toContain("flex flex-col items-start gap-2 sm:flex-row");
    expect(pipelineCard).toContain('className="inline-flex"');
    expect(pipelineCard).toContain("grid grid-cols-1");
    expect(pipelineCard).toContain("sm:grid-cols-2");
    expect(pipelineCard).toContain('className="mt-3 flex items-center justify-between gap-2"');
    expect(visuals).toContain("data-homepage-pipeline-column={status}");
    expect(visuals).toContain('{ label: labels.open, status: "deal-open" as const }');
    expect(visuals).not.toContain("PIPELINE_RECORDS.open");
    expect(visuals).not.toContain('data-homepage-pipeline-source-card="deal-open"');
    expect(visuals.match(/data-homepage-pipeline-source-footprint="deal-open"/gu)).toHaveLength(1);
    expect(visuals).not.toMatch(/PIPELINE_COLUMN_ACTIVITY|PIPELINE_COLUMN_TIMES/u);
    expect(visuals).not.toMatch(/data-homepage-pipeline-highlight|data-homepage-pipeline-card-dim/u);
    expect(visuals).toContain("data-homepage-drag-cursor");
    expect(visuals).toContain("PIPELINE_DRAG_X");
    expect(visuals).toContain("PIPELINE_DRAG_Y");
    expect(visuals).not.toContain("PIPELINE_SOURCE_CARD_OPACITY");
    expect(visuals).toContain("PIPELINE_SOURCE_OUTLINE_OPACITY");
    expect(visuals).not.toMatch(/PIPELINE_OPEN_CARD_FILTER|data-homepage-pipeline-open-card-blur|blur\(/u);
    expect(visuals).not.toContain("PIPELINE_DRAG_OPACITY");
    expect(visuals).toContain('data-homepage-motion-phase="signal-to-record"');
    expect(visuals).toContain('data-homepage-motion-phase="provider-to-draft"');
    expect(visuals).toContain('data-homepage-motion-phase="human-review"');
    expect(visuals).toContain('data-homepage-motion-phase="pipeline-drag-preview"');
    expect(visuals).toContain("data-homepage-motion-scene={name}");
    expect(visuals).toContain('data-motion-active={motionActive ? "true" : "false"}');
    expect(visuals).not.toMatch(/remotion|hyperframes|requestAnimationFrame/iu);
  });

  it("runs horizontal rules to the edges of their owning surfaces", () => {
    const benefits = readComponent("homepage-benefits.tsx");
    const hero = readComponent("homepage-hero.tsx");
    const strip = readComponent("homepage-stats-row.tsx");

    expect(componentSource.match(/data-homepage-rules="full-bleed"/gu)?.length).toBeGreaterThanOrEqual(7);
    expect(benefits).toContain('<section className="relative w-full border-y border-border" id="facts">');
    expect(benefits).toContain("lg:grid-cols-5");
    expect(benefits).not.toContain("absolute inset-x-0 top-1/2");
    for (const figure of ['figure: "5"', "figure: MCP", "figure: AGPL-3.0", "figure: EU", "figure: DE"]) {
      expect(englishHomepage).toContain(figure);
    }
    expect(benefits).not.toContain("grid grid-cols-2 border-y border-border");
    expect(strip).toContain('className="w-full border-y border-border"');
    expect(hero).toContain('className="relative isolate w-full overflow-hidden"');
    expect(hero).toContain('data-homepage-section="hero"');
    expect(page).toContain('data-marketing-flow="continuous"');
    expect(globalStyles).toMatch(/\[data-marketing-flow="continuous"\]\s+\.marketing-section:not/u);
  });

  it("keeps the base display neutral while accenting the rotating subject", () => {
    const hero = readComponent("homepage-hero.tsx");
    const walkthrough = readComponent("homepage-walkthrough.tsx");
    const heroHeading = readOpeningElementContaining(hero, 'className="text-hero mt-7 max-w-6xl"');

    expect(heroHeading).not.toContain("text-primary");
    expect(hero).toContain('className="text-hero mt-7 max-w-6xl"');
    expect(hero).toContain('className="p-[0.12em] text-primary"');
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
    expect(componentSource).not.toMatch(/max-w-\[(?:1100|1200|1240|1400|1440)px\]/u);
    expect(componentSource.match(/tone="inverse"/gu)).toHaveLength(1);
    expect(componentSource).toMatch(/MarketingContainer|MarketingSection/u);
  });

  it("recomposes illustrations for narrow and split placements without an outer border", () => {
    const visuals = readComponent("homepage-story-visuals.tsx");
    const artboard = readFileSync(join(REPO_ROOT, "components", "marketing", "visuals", "visual-artboard.tsx"), "utf8");

    expect(visuals).toContain("aspect-[4/5]");
    expect(visuals).toContain("sm:aspect-[8/5]");
    expect(visuals).toContain("MarketingVisualArtboard");
    expect(artboard).toContain("overflow-hidden rounded-xl bg-sidebar");
    expect(visuals).toContain('className="absolute inset-0 size-full sm:hidden"');
    expect(visuals).toContain('className="absolute inset-0 hidden size-full sm:block"');
    expect(visuals).not.toMatch(/data-homepage-visual=[\s\S]{0,240}border border/u);
  });

  it("drags one pipeline card out and back while showing only an empty source footprint", () => {
    const visuals = readComponent("homepage-story-visuals.tsx");

    const x = readLiteralKeyframes(visuals, "PIPELINE_DRAG_X");
    const y = readLiteralKeyframes(visuals, "PIPELINE_DRAG_Y").map(Number);
    const sourceOutlineOpacity = readLiteralKeyframes(visuals, "PIPELINE_SOURCE_OUTLINE_OPACITY").map(Number);
    const dragTimes = readLiteralKeyframes(visuals, "PIPELINE_DRAG_TIMES").map(Number);
    const sourceOutlineElement = readOpeningElementContaining(
      visuals,
      'data-homepage-pipeline-source-footprint="deal-open"',
    );
    const sourceOutlineIndex = visuals.indexOf('data-homepage-pipeline-source-footprint="deal-open"');
    const sourceOutlineEnd = visuals.indexOf("/>", sourceOutlineIndex);
    const sourceOutlineBlock = visuals.slice(sourceOutlineIndex, sourceOutlineEnd);
    const movingPhaseIndex = visuals.indexOf('data-homepage-motion-phase="pipeline-drag-preview"');
    const movingElementStart = visuals.lastIndexOf("<motion.div", movingPhaseIndex);
    const movingElementEnd = visuals.indexOf("</motion.div>", movingPhaseIndex);
    const movingElement = visuals.slice(movingElementStart, movingElementEnd);
    const xAsNumbers = x.map((value) => Number.parseFloat(String(value)));
    const dragStartIndex = xAsNumbers.findIndex((value, index) => value !== xAsNumbers[0] || y[index] !== y[0]);
    const furthestX = Math.max(...xAsNumbers);
    const furthestXIndex = xAsNumbers.lastIndexOf(furthestX);
    const returnIndex = xAsNumbers.findIndex(
      (value, index) => index > furthestXIndex && value === xAsNumbers[0] && y[index] === y[0],
    );

    expect(x).toHaveLength(dragTimes.length);
    expect(y).toHaveLength(dragTimes.length);
    expect(sourceOutlineOpacity).toHaveLength(dragTimes.length);
    expect(Math.max(...y)).toBeGreaterThan(Math.min(...y));
    expect(furthestX).toBeGreaterThan(xAsNumbers[0]);
    expect(returnIndex).toBeGreaterThan(furthestXIndex);
    expect(
      xAsNumbers.slice(furthestXIndex + 1, returnIndex).some((value) => value > xAsNumbers[0] && value < furthestX),
    ).toBe(true);
    expect(xAsNumbers.at(-1)).toBe(xAsNumbers[0]);
    expect(y.at(-1)).toBe(y[0]);
    expect(dragStartIndex).toBeGreaterThan(0);
    expect(sourceOutlineOpacity[0]).toBe(0);
    expect(sourceOutlineOpacity[dragStartIndex - 1]).toBe(1);
    expect(Math.max(...sourceOutlineOpacity)).toBeGreaterThan(0);
    expect(sourceOutlineOpacity.at(-1)).toBe(0);
    expect(sourceOutlineOpacity.slice(dragStartIndex, returnIndex).every((opacity) => opacity > 0)).toBe(true);
    expect(sourceOutlineOpacity[returnIndex]).toBe(0);
    expect(movingElementStart).toBeGreaterThanOrEqual(0);
    expect(movingElementEnd).toBeGreaterThan(movingPhaseIndex);
    expect(movingElement).toContain("x: PIPELINE_DRAG_X");
    expect(movingElement).toContain("y: PIPELINE_DRAG_Y");
    expect(movingElement).toContain("times: PIPELINE_DRAG_TIMES");
    expect(movingElement).not.toMatch(/\bopacity:/u);
    expect(movingElement).toContain("record={PIPELINE_RECORDS.active}");
    expect(visuals.match(/record=\{PIPELINE_RECORDS\.active\}/gu)).toHaveLength(1);
    expect(visuals).toContain("transform: `translateY(${PIPELINE_DRAG_Y[0]}px)`");
    expect(sourceOutlineElement).toMatch(/^<motion\.span\b/u);
    expect(sourceOutlineElement).toContain("aria-hidden");
    expect(sourceOutlineElement).toContain("pointer-events-none relative z-10 col-start-1 row-start-1");
    expect(sourceOutlineElement).toContain("rounded-xl border border-dashed border-input");
    expect(sourceOutlineElement).toContain("bg-card/50");
    expect(sourceOutlineElement).toContain("opacity: PIPELINE_SOURCE_OUTLINE_OPACITY");
    expect(sourceOutlineBlock).not.toContain("PipelineCard");
    expect(movingElement).toContain("relative z-20 col-start-1 row-start-1");
    expect(visuals).not.toContain('data-homepage-pipeline-source-card="deal-open"');
    expect(visuals.match(/data-homepage-pipeline-source-footprint="deal-open"/gu)).toHaveLength(1);
    expect(visuals).toContain("data-homepage-pipeline-background-card={status}");
    expect(visuals).not.toMatch(/PIPELINE_COLUMN_ACTIVITY|PIPELINE_COLUMN_TIMES|PIPELINE_DRAG_OPACITY/u);
    expect(visuals).not.toMatch(/data-homepage-pipeline-highlight|data-homepage-pipeline-card-dim/u);
    expect(visuals).not.toMatch(/PIPELINE_OPEN_CARD_FILTER|data-homepage-pipeline-open-card-blur|blur\(/u);
    expect(visuals).not.toMatch(/brightness-(?:50|75|\[0\.7\])/u);
    expect(visuals).not.toMatch(/w-\[(?:25|26|27)%\][^\n]*opacity-(?:35|40|45)/u);
  });
});
