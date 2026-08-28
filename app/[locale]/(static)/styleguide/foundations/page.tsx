import type { Metadata } from "next";
import Image from "next/image";

import { ResponsiveContract } from "../components/responsive-contract";
import { StyleguideChapter } from "../components/styleguide-chapter";
import { TokenTable, TypeTable } from "../components/style-readout";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Marketing foundations",
};

const SURFACES = [
  {
    name: "--sidebar",
    role: "canvas — the plane behind the page and same-theme canvas sections",
  },
  { name: "--background", role: "page — the marketing body" },
  { name: "--card", role: "raised — cards, media frames, table bodies" },
];

const EDGES = [
  {
    name: "--border",
    role: "rims and rules owned by a rail, list, table or card",
  },
  { name: "--input", role: "a control edge at rest" },
  { name: "--border-strong", role: "control hover, floating-surface rim" },
];

const WASHES = [
  { name: "--muted", role: "a subdued surface, relative to its host" },
  { name: "--accent", role: "hover" },
  { name: "--selected", role: "selection" },
  { name: "--placeholder", role: "skeleton and neutral media fill" },
];

const ACCENTS = [
  { name: "--primary", role: "the one accent — a payoff, never a mood" },
  { name: "--success", role: "a resolved state" },
  { name: "--warning", role: "an attention state" },
  { name: "--destructive", role: "a destructive state" },
];

const CONTRAST_RULES = [
  "Page mode establishes continuity.",
  "Inverse marks one high-salience pivot.",
  "The band stays full bleed.",
  "Inverse sections are never nested or adjacent.",
  "Cards restart the local surface ladder.",
  "Semantic tokens and local media inherit the opposite palette.",
] as const;

const TYPE_ROLES = [
  {
    className: "text-hero",
    sample: "One clear promise with one dominant idea.",
  },
  {
    className: "text-display",
    sample: "Editorial display for a singular campaign statement",
  },
  {
    className: "text-display-sm",
    sample: "Every conversation lands on the record it belongs to",
  },
  {
    className: "text-lede",
    sample:
      "Claude can use allowed CRM and inbox operations through MCP. You review its changes and drafts in Customermates.",
  },
  {
    className: "text-eyebrow",
    sample: "Reserved for metadata, not section headings",
  },
  {
    className: "text-meta",
    sample: "No credit card required. Cancel anytime. Made in Germany.",
  },
];

const GEOMETRY = [
  {
    label: "--container-marketing",
    role: "the current max-w-7xl public shell width, reused by every guide chapter",
    value: "80rem",
  },
  {
    label: "--marketing-gutter",
    role: "the page gutter, stepping at 40rem",
    value: "1.25rem → 2rem",
  },
  {
    label: "--marketing-column-gap",
    role: "the grid gutter, stepping at 40rem and 64rem",
    value: "0.5 → 1 → 1.5rem",
  },
  {
    label: "--breakpoint-nav",
    role: "the target marketing boundary used by this guide switcher",
    value: "56rem",
  },
  {
    label: "--radius-card",
    role: "a media or content card",
    value: "--radius + 12px",
  },
  {
    label: "--radius-xl",
    role: "a frameless brand-illustration artboard; focal cards keep --radius-card",
    value: "--radius + 4px",
  },
  {
    label: "masked token grid",
    role: "optional low-contrast atmosphere inside an artboard, never a required page background",
    value: "optional",
  },
  {
    label: "--radius-panel",
    role: "a full-width band",
    value: "--radius + 16px",
  },
  {
    label: "--aspect-hero",
    role: "the wide visual placement",
    value: "16 / 9",
  },
  {
    label: "--aspect-social",
    role: "the card a link unfurls into",
    value: "1200 / 630",
  },
  {
    label: "--marketing-duration",
    role: "the one interface transition duration",
    value: "200ms",
  },
  {
    label: "--marketing-ease",
    role: "the one interface easing curve",
    value: "cubic-bezier(.22, 1, .36, 1)",
  },
];

const FORBIDDEN = [
  [
    "No shadow on a new resting surface",
    "Elevation is a rung, not a distance. Illustration depth stays inside its artboard.",
  ],
  ["No wash as a resting fill", "A wash carries state and must not silently become another surface tier."],
  ["No literal colour", "Theme changes reach every pixel through Customermates tokens."],
  ["No radius off the scale", "Card and panel radii cover every marketing surface."],
  ["No bespoke breakpoint", "The navigation and layout boundaries are declared once."],
  ["No complete invented application", "A brand illustration is editorial, never a fake product screenshot."],
  ["No paragraph inside artwork", "The renderer receives reduced labels, not source prose."],
  ["No unsupported number", "A number needs an explicit fixture or fact reference."],
  ["No inferred product proof", "Real local product evidence must always be requested explicitly."],
  ["No silent locale fallback", "Every visible label must exist in the requested locale and fit without truncation."],
] as const;

export default function FoundationsPage() {
  return (
    <StyleguideChapter chapter="foundations">
      <MarketingSection
        description="Three opaque rungs and no more. Fill says which plane a thing sits on; it never carries state."
        id="surfaces"
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
        description="The page theme carries the story. One full-width inverse band may mark its most important pivot without turning the page into alternating stripes."
        id="contrast"
        title="One deliberate pivot"
        tone="inverse"
      >
        <div className="marketing-grid mt-14 items-center gap-y-10 lg:mt-16">
          <div className="col-span-12 lg:col-span-5">
            <ul className="space-y-3">
              {CONTRAST_RULES.map((rule) => (
                <li key={rule} className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground">
                  <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />

                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="col-span-12 lg:col-start-8 lg:col-end-13">
            <div className="rounded-card border border-border bg-card p-7">
              <Image
                alt="Customermates"
                className="h-auto w-[190px] dark:hidden"
                height={23}
                src="/images/light/customermates.svg"
                width={229}
              />

              <Image
                alt=""
                aria-hidden="true"
                className="hidden h-auto w-[190px] dark:block"
                height={23}
                src="/images/dark/customermates.svg"
                width={229}
              />

              <div className="mt-10 border-t border-border pt-6">
                <p className="font-medium">Raised starts again inside the inverse palette.</p>

                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  The logo, copy, borders, controls and artwork all resolve against this local theme.
                </p>

                <Button className="mt-6 bg-foreground text-background hover:bg-foreground/90" size="lg">
                  One focal action
                </Button>
              </div>
            </div>
          </div>
        </div>
      </MarketingSection>

      <MarketingSection
        description="Borders and washes are alpha, so one value per tier reads correctly on every rung and at any depth. Continuous page flow has no routine section rules; a rail, list, table or card owns every visible divider and runs it edge to edge."
        id="edges-washes"
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
        id="signals"
        title="Accent and signal"
      >
        <div className="mt-14 lg:mt-16">
          <TokenTable rows={ACCENTS} />
        </div>
      </MarketingSection>

      <MarketingSection
        description="One family. Contrast comes from size, neutral 500 weight and tracking; accent colour stays with signals and actions rather than display text."
        id="typography"
        title="Typography"
      >
        <div className="mt-14 lg:mt-16">
          <TypeTable rows={TYPE_ROLES} />
        </div>
      </MarketingSection>

      <MarketingSection description="Stated once and read everywhere." id="geometry" title="Geometry">
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

          <div>
            <p className="text-meta mb-3">frameless artboard</p>

            <div className="relative size-28 overflow-hidden rounded-xl bg-sidebar">
              <div className="absolute inset-0 opacity-45 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(circle_at_center,black,transparent_88%)]" />
            </div>
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
      </MarketingSection>

      <div className="w-full scroll-mt-28" id="responsive">
        <ResponsiveContract />
      </div>

      <MarketingSection
        description="The global rules are short enough to apply before a page or visual is composed."
        id="prohibitions"
        title="What the system forbids"
      >
        <div className="mt-14 overflow-hidden rounded-card border border-border bg-card lg:mt-16">
          <ul className="divide-y divide-border">
            {FORBIDDEN.map(([rule, reason]) => (
              <li key={rule} className="flex flex-col gap-2 px-6 py-4 lg:flex-row lg:items-baseline lg:gap-6">
                <span className="w-80 shrink-0 text-sm font-medium">{rule}</span>

                <span className="flex-1 text-sm text-muted-foreground">{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      </MarketingSection>
    </StyleguideChapter>
  );
}
