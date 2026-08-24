import type { Metadata } from "next";

import { ImageClasses } from "./components/image-classes";
import { ResponsiveContract } from "./components/responsive-contract";
import { VisualStandards } from "./components/visual-standards";
import { SectionPatterns } from "./components/section-patterns";
import { TokenTable, TypeTable } from "./components/style-readout";

import { Footer } from "@/app/components/footer";
import { MarketingContainer } from "@/components/marketing/marketing-container";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Marketing style guide",
  robots: { index: false, follow: false },
};

const CONTENTS = [
  { href: "#foundations", label: "Foundations" },
  { href: "#grid", label: "Grid and responsive contract" },
  { href: "#patterns", label: "Section patterns" },
  { href: "#images", label: "Image classes" },
  { href: "#standards", label: "Visual standards" },
  { href: "#motion", label: "Motion" },
  { href: "#rules", label: "What the system forbids" },
];

const SURFACES = [
  { name: "--sidebar", role: "canvas — the plane behind the page, and the closing panel" },
  { name: "--background", role: "page — the marketing body" },
  { name: "--card", role: "raised — cards, media frames, table bodies" },
];

const EDGES = [
  { name: "--border", role: "container rims, section rules, table rules" },
  { name: "--input", role: "a control edge at rest" },
  { name: "--border-strong", role: "control hover, floating-surface rim" },
];

const WASHES = [
  { name: "--muted", role: "a subdued surface, relative to its host" },
  { name: "--accent", role: "hover" },
  { name: "--selected", role: "selection" },
  { name: "--placeholder", role: "skeleton and media fill" },
];

const ACCENTS = [
  { name: "--primary", role: "the one accent — a payoff, never a mood" },
  { name: "--success", role: "a resolved state" },
  { name: "--warning", role: "an attention state" },
  { name: "--destructive", role: "a destructive state" },
];

const TYPE_ROLES = [
  { className: "text-display", sample: "The agentic CRM that keeps itself current" },
  { className: "text-display-sm", sample: "Every conversation lands on the record it belongs to" },
  {
    className: "text-lede",
    sample:
      "A supported external AI client can use allowed CRM and inbox operations through MCP. You review its changes and drafts in Customermates.",
  },
  { className: "text-eyebrow", sample: "Reserved for metadata, not section headings" },
  { className: "text-meta", sample: "No credit card required. Cancel anytime. Made in Germany." },
];

const GEOMETRY = [
  { label: "--container-marketing", role: "the one content width every public page shares", value: "90rem" },
  { label: "--marketing-gutter", role: "the page gutter, stepping at 40rem", value: "1.25rem → 2rem" },
  { label: "--marketing-column-gap", role: "the grid gutter, stepping at 40rem and 64rem", value: "0.5 → 1 → 1.5rem" },
  { label: "--breakpoint-nav", role: "where the public navigation becomes a drawer", value: "56rem" },
  { label: "--radius-card", role: "a media or content card", value: "--radius + 12px" },
  { label: "--radius-panel", role: "a full-width band", value: "--radius + 16px" },
  { label: "--aspect-hero", role: "pinned to the 1920×1080 hero assets", value: "16 / 9" },
  { label: "--aspect-social", role: "the card a link unfurls into", value: "1200 / 630" },
  { label: "--marketing-duration", role: "the one transition duration", value: "200ms" },
  { label: "--marketing-ease", role: "the one easing curve", value: "cubic-bezier(.22, 1, .36, 1)" },
];

const FORBIDDEN = [
  {
    enforced: false,
    reason:
      "elevation is which rung a thing sits on, not how far it floats. A target rather than a fact: the pricing card and the nav header still carry one.",
    rule: "No shadow on a new marketing surface.",
  },
  {
    enforced: true,
    reason:
      "a wash carries state. Pinned to a surface it inverts between themes. The test catches a wash at a custom alpha; a bare one is caught in review.",
    rule: "No wash as a resting fill.",
  },
  {
    enforced: true,
    reason: "colour comes from the tokens, so a theme change reaches every pixel.",
    rule: "No literal colour.",
  },
  {
    enforced: true,
    reason: "border alphas are derived per theme, so an ad-hoc foreground alpha inverts against its ground.",
    rule: "No border-foreground alpha.",
  },
  {
    enforced: true,
    reason: "two radii cover every marketing surface, and a third reads as an accident.",
    rule: "No radius off the scale.",
  },
  {
    enforced: true,
    reason: "the navigation boundary is declared once and read everywhere.",
    rule: "No bespoke breakpoint.",
  },
  {
    enforced: true,
    reason: "the two display roles are fitted lines, not per-page guesses.",
    rule: "No inline display clamp.",
  },
  {
    enforced: false,
    reason: "contrast comes from size, weight and tracking within one family.",
    rule: "No second typeface.",
  },
  {
    enforced: false,
    reason: "the eyebrow is metadata. The reference site puts one above no section heading at all.",
    rule: "No eyebrow above a section heading.",
  },
  {
    enforced: false,
    reason: "a third step turns a flat illustration into a rendering.",
    rule: "No third ink opacity in an illustration.",
  },
  {
    enforced: false,
    reason: "a capture is evidence. A composited one is not.",
    rule: "No product state the product cannot reach.",
  },
];

export default function StyleguidePage() {
  return (
    <div className="flex flex-col items-center">
      <section className="w-full pt-16 pb-12 md:pt-24">
        <MarketingContainer>
          <p className="text-eyebrow">Internal reference, not indexed</p>

          <h1 className="text-display m-0 mt-6 max-w-5xl">The marketing design system, as it actually renders</h1>

          <p className="text-lede mt-8">
            Token, type and grid figures are read out of the running stylesheet at paint time and cannot drift. The
            contracts stated below them, geometry, breakpoints and the type ladder, are written down here and have to be
            re-checked against styles/globals.css when a token moves. A specimen says so when it is the shipped
            component; the rest are drawn here to show a shape no component owns yet. Switch the theme in the navigation
            to see both grounds, and resize the window to see the contract hold.
          </p>

          <nav className="mt-12 flex flex-wrap gap-2.5">
            {CONTENTS.map((entry) => (
              <a
                key={entry.href}
                className="marketing-transition rounded-full border border-border bg-card px-4 py-2 text-sm hover:border-border-strong"
                href={entry.href}
              >
                {entry.label}
              </a>
            ))}
          </nav>
        </MarketingContainer>
      </section>

      <MarketingSection
        description="Three opaque rungs and no more. Fill says which plane a thing sits on; it never carries state."
        id="foundations"
        title="Surfaces"
      >
        <div className="marketing-grid mt-14 gap-y-4 lg:mt-16">
          <div className="col-span-12 lg:col-span-6">
            <TokenTable rows={SURFACES} />
          </div>

          <div className="col-span-12 rounded-card border border-border bg-sidebar p-6 lg:col-span-6">
            <p className="text-meta mb-4">Canvas, holding the page</p>

            <div className="rounded-card border border-border bg-background p-6">
              <p className="text-meta mb-4">Page, holding a card</p>

              <div className="rounded-card border border-border bg-card p-6">
                <p className="text-meta">Raised. Nothing nests deeper than this.</p>
              </div>
            </div>
          </div>
        </div>
      </MarketingSection>

      <MarketingSection
        description="Borders and washes are alpha, so one value per tier reads correctly on every rung and at any depth."
        title="Edges and washes"
      >
        <div className="marketing-grid mt-14 gap-y-4 lg:mt-16">
          <div className="col-span-12 lg:col-span-6">
            <TokenTable rows={EDGES} />
          </div>

          <div className="col-span-12 lg:col-span-6">
            <TokenTable rows={WASHES} />
          </div>
        </div>
      </MarketingSection>

      <MarketingSection
        description="One accent, used where something resolves. Signal colours carry state and nothing else."
        title="Accent and signal"
      >
        <div className="mt-14 lg:mt-16">
          <TokenTable rows={ACCENTS} />
        </div>
      </MarketingSection>

      <MarketingSection
        description="One family. Contrast comes from size, weight and tracking — the hero at 700, every heading below it at 500."
        title="Type"
      >
        <div className="mt-14 lg:mt-16">
          <TypeTable rows={TYPE_ROLES} />
        </div>
      </MarketingSection>

      <MarketingSection description="Stated once, read everywhere." title="Geometry and motion">
        <div className="mt-14 overflow-hidden rounded-card border border-border bg-card lg:mt-16">
          <ul className="divide-y divide-border">
            {GEOMETRY.map((row) => (
              <li key={row.label} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3">
                <code className="w-56 shrink-0 font-mono text-sm">{row.label}</code>

                <code className="text-meta w-56 shrink-0 font-mono">{row.value}</code>

                <span className="text-sm text-muted-foreground">{row.role}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-10 flex flex-wrap items-end gap-6">
          <div>
            <p className="text-meta mb-3">rounded-card</p>

            <div className="size-28 rounded-card border border-border bg-muted" />
          </div>

          <div>
            <p className="text-meta mb-3">rounded-panel</p>

            <div className="size-28 rounded-panel border border-border bg-muted" />
          </div>

          <div className="min-w-64 flex-1">
            <p className="text-meta mb-3">aspect-hero</p>

            <div className="aspect-hero w-full rounded-card border border-border bg-placeholder" />
          </div>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Button size="lg">Primary</Button>

          <Button size="lg" variant="secondary">
            Secondary
          </Button>

          <Button size="lg" variant="ghost">
            Ghost
          </Button>

          <Button size="lg" variant="softPrimary">
            Soft primary
          </Button>

          <Button disabled size="lg">
            Disabled
          </Button>
        </div>

        <p className="text-meta mt-5">
          Every hover above moves over 200ms on the one curve. A control that animates on a different curve reads as a
          different product.
        </p>
      </MarketingSection>

      <div className="w-full" id="grid">
        <ResponsiveContract />
      </div>

      <div className="w-full" id="patterns">
        <MarketingContainer className="pt-20 pb-4">
          <h2 className="text-display-sm m-0">Section patterns</h2>

          <p className="text-lede mt-5">
            Eleven shapes cover every public page. Each one below is rendered at full width, exactly as it ships, with
            the grid spans it uses and the width it collapses at. A section that does not fit one of these is a new
            pattern and belongs on this page before it belongs on a page.
          </p>
        </MarketingContainer>

        <SectionPatterns />
      </div>

      <div className="w-full" id="images">
        <ImageClasses />
      </div>

      <VisualStandards />

      <MarketingSection
        description="The system is mostly a list of things it will not do. Six of these fail a convention test; the other five are read in review."
        id="rules"
        title="What the system forbids"
      >
        <div className="mt-14 overflow-hidden rounded-card border border-border bg-card lg:mt-16">
          <ul className="divide-y divide-border">
            {FORBIDDEN.map((entry) => (
              <li key={entry.rule} className="flex flex-col gap-2 px-6 py-4 lg:flex-row lg:items-baseline lg:gap-6">
                <span className="w-80 shrink-0 text-sm font-medium">{entry.rule}</span>

                <span className="flex-1 text-sm text-muted-foreground">{entry.reason}</span>

                <code className="text-meta shrink-0 font-mono">{entry.enforced ? "test" : "review"}</code>
              </li>
            ))}
          </ul>
        </div>
      </MarketingSection>

      <Footer />
    </div>
  );
}
