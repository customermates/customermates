import type { Metadata } from "next";

import { TokenTable, TypeTable } from "./components/style-readout";

import { Footer } from "@/app/components/footer";
import { CTASection } from "@/components/marketing/cta-section";
import { MarketingContainer } from "@/components/marketing/marketing-container";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Marketing style guide",
  robots: { index: false, follow: false },
};

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
  { label: "--container-marketing", value: "90rem", role: "the one content width every public page shares" },
  { label: "--marketing-gutter", value: "1.25rem, 2rem from sm", role: "the page gutter" },
  { label: "--breakpoint-nav", value: "56rem", role: "where the public navigation becomes a drawer" },
  { label: "--radius-card", value: "--radius + 12px", role: "a media or content card" },
  { label: "--radius-panel", value: "--radius + 16px", role: "a full-width band" },
  { label: "--aspect-hero", value: "16 / 9", role: "pinned to the 1920×1080 hero assets" },
  { label: "--marketing-duration", value: "200ms", role: "the one transition duration" },
  { label: "--marketing-ease", value: "cubic-bezier(.22, 1, .36, 1)", role: "the one easing curve" },
];

export default function StyleguidePage() {
  return (
    <div className="flex flex-col items-center">
      <section className="w-full pt-16 pb-12 md:pt-24">
        <MarketingContainer>
          <p className="text-eyebrow">Internal reference, not indexed</p>

          <h1 className="text-display m-0 mt-6 max-w-5xl">The marketing design system, as it actually renders</h1>

          <p className="text-lede mt-8">
            Every value on this page is read out of the running stylesheet at paint time, so it cannot drift from what
            the public pages ship. Switch the theme in the navigation to see both grounds.
          </p>
        </MarketingContainer>
      </section>

      <MarketingSection
        description="Three opaque rungs and no more. Fill says which plane a thing sits on; it never carries state."
        title="Surfaces"
      >
        <div className="mt-12 grid gap-4 lg:grid-cols-2">
          <TokenTable rows={SURFACES} />

          <div className="rounded-card border border-border bg-sidebar p-6">
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
        <div className="mt-12 grid gap-4 lg:grid-cols-2">
          <TokenTable rows={EDGES} />

          <TokenTable rows={WASHES} />
        </div>
      </MarketingSection>

      <MarketingSection
        description="One accent, used where something resolves. Signal colours carry state and nothing else."
        title="Accent and signal"
      >
        <div className="mt-12">
          <TokenTable rows={ACCENTS} />
        </div>
      </MarketingSection>

      <MarketingSection
        description="One family. Contrast comes from size, weight and tracking — the hero at 700, every heading below it at 500."
        title="Type"
      >
        <div className="mt-12">
          <TypeTable rows={TYPE_ROLES} />
        </div>
      </MarketingSection>

      <MarketingSection description="Stated once, read everywhere." title="Geometry and motion">
        <div className="mt-12 overflow-hidden rounded-card border border-border bg-card">
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

        <div className="mt-8 flex flex-wrap items-end gap-6">
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
      </MarketingSection>

      <MarketingSection
        description="The header above is the real component. Centred, no eyebrow, measure capped — the shape every section below the hero takes."
        title="Sections and controls"
      >
        <div className="mt-12 flex flex-wrap gap-3">
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

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {["Card on the raised rung", "One border tier", "One radius", "No shadow"].map((label) => (
            <article
              key={label}
              className="marketing-transition rounded-card border border-border bg-card p-6 hover:border-border-strong"
            >
              <h3 className="font-medium leading-tight">{label}</h3>

              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Cards carry a single border and the card radius. Depth comes from the rung they sit on.
              </p>
            </article>
          ))}
        </div>
      </MarketingSection>

      <CTASection
        action="This panel is the real closing component"
        buttonLeftHref="/pricing"
        buttonLeftText="Primary action"
        buttonRightHref="/docs"
        buttonRightText="Secondary action"
        description="It sits on the canvas rung rather than inverting, so it reads as the end of the page in both themes without a second palette."
        hint="Rendered from the shipped component, not a copy."
      />

      <Footer />
    </div>
  );
}
