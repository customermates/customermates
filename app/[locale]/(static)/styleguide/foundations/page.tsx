import type { Metadata } from "next";
import Image from "next/image";

import { ResponsiveContract } from "../components/responsive-contract";
import { StyleguideChapter } from "../components/styleguide-chapter";
import { TokenTable, TypeTable } from "../components/style-readout";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { Step, Steps } from "@/components/marketing/process-steps";
import { PhoneFrame, ProductPanel, ProductWindow } from "@/components/marketing/product-window";
import { Button } from "@/components/ui/button";
import { GridPattern } from "@/components/shared/grid-pattern";
import { enableStaticLocale, type StaticLocaleProps } from "@/i18n/static-locale";

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
    role: "low-contrast atmosphere for artboards and centered-card page shells; not a generic content backdrop",
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

const GRADIENT_RULES = [
  "text-display, text-display-sm and text-hero carry it; text-display-gradient opts in custom-sized titles such as Markdown and docs page titles and the featured post.",
  "Muted accent spans inside a display heading join the gradient instead of keeping their grey.",
  "Moving or separately coloured text stays outside it, because background-clip paints through every glyph.",
  "Forced colours fall back to plain text.",
] as const;

const SURFACE_RULES = [
  [
    "glass-surface",
    "Floating controls over a constant backdrop: the stage switcher and every section-level secondary action in heroes and closing panels.",
  ],
  ["Card actions", "Actions inside an opaque card, such as a pricing plan, stay on the solid secondary button."],
  [
    "floating-panel",
    "Menus and popovers that can cross light and dark sections: solid popover fill with the same rim.",
  ],
  [
    "mark-glow",
    "The lit glass tile: a tinted highlight from the top left, a rim and a soft shadow. It carries the hero marks and the selected state of the stage tabs and the navigation, tinted with primary.",
  ],
  ["Never", "Glass over content that switches between light and dark sections, or on resting content panels."],
  [
    "Section edges",
    "In continuous pages a canvas section fades in and out of the page colour over 7rem; the inverse band keeps hard edges.",
  ],
] as const;

const FRAMING_RULES = [
  [
    "ProductWindow",
    "A thin translucent bezel with a ring and a deep soft shadow around an app-coloured surface; no imitation title bar.",
  ],
  [
    "ProductPanel",
    "A tinted, primary-lit well the window bleeds out of, so a section shows a readable crop of one area.",
  ],
  ["PhoneFrame", "The window frame in phone proportions, layered over a desktop window when both appear."],
  [
    "product-card",
    "The raised card surface for illustration cards, diagram cards and floating forms: hairline rim, inner highlight, theme-aware deep shadow.",
  ],
  ["Crops", "Cropping happens in CSS on unedited stills; no section adds its own card shadow or radius."],
] as const;

const MOTION_RULES = [
  [
    "Rotating claim",
    "One word on its own line, in primary on a soft highlight padded from the font metrics; the highlight animates its real width every 2.6 s.",
  ],
  [
    "Live stage",
    "From 40rem, one live demo iframe per tab after hydration with the next tab preloaded; 6 s rotation with a progress ring, stopped by any visitor action.",
  ],
  ["Scroll reveal", "Panels, video and closing card rise 2rem and fade in once through a CSS view timeline."],
  [
    "Step progress",
    "Numbered steps fill their line in primary and light each number as it crosses the middle of the screen.",
  ],
  [
    "Restraint",
    "Every motion stops off screen and while the document is hidden, and reduced motion receives the final state.",
  ],
] as const;

const FORBIDDEN = [
  [
    "No shadow on a new resting surface",
    "Elevation is a rung, not a distance. Only floating layers carry shadow: product windows, floating panels, glass controls and lit marks.",
  ],
  [
    "No glass across a section change",
    "Blur cannot hide a hard light-to-dark edge, so a translucent surface splits. Menus that can cross sections use floating-panel.",
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

export default async function FoundationsPage({ params }: StaticLocaleProps) {
  await enableStaticLocale(params);

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
              <GridPattern className="opacity-45" density="compact" />
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

      <MarketingSection
        description="One vertical gradient for every display heading, from the foreground colour to 65 per cent of it."
        id="heading-gradient"
        title="Display gradient"
      >
        <div className="mt-14 grid gap-10 lg:mt-16 lg:grid-cols-2">
          <div className="rounded-card border border-border bg-background p-8">
            <p className="text-meta mb-4">text-display-sm</p>

            <p className="text-display-sm m-0">
              Every channel, <span className="text-muted-foreground">one customer story.</span>
            </p>
          </div>

          <ul className="m-0 list-none space-y-3 p-0 text-sm leading-relaxed text-muted-foreground">
            {GRADIENT_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      </MarketingSection>

      <MarketingSection
        description="Glass belongs to small floating controls over a constant backdrop; menus stay solid."
        id="glass"
        title="Glass and floating surfaces"
      >
        <div className="mt-14 grid gap-10 lg:mt-16 lg:grid-cols-2">
          <div className="relative isolate flex min-h-64 flex-col items-center justify-center gap-6 overflow-hidden rounded-card border border-border bg-sidebar p-8">
            <div
              aria-hidden
              className="absolute inset-0 -z-10 bg-[radial-gradient(60%_70%_at_50%_100%,color-mix(in_oklab,var(--primary)_30%,transparent),transparent)]"
            />

            <div className="glass-surface flex gap-0.5 rounded-full p-1 text-sm font-medium">
              <span className="relative rounded-full bg-foreground/[0.09] px-3.5 py-1.5 text-foreground ring-1 ring-foreground/15">
                Inbox
              </span>

              <span className="px-3.5 py-1.5 text-muted-foreground">Customers</span>

              <span className="px-3.5 py-1.5 text-muted-foreground">Pipeline</span>
            </div>

            <div className="floating-panel w-full max-w-xs rounded-2xl p-1.5 text-[13px] font-medium">
              <p className="m-0 rounded-xl bg-foreground/[0.07] px-3 py-2.5">Unified inbox</p>

              <p className="m-0 px-3 py-2.5">Sales pipeline</p>
            </div>
          </div>

          <ul className="m-0 list-none divide-y divide-border overflow-hidden rounded-card border border-border bg-card p-0">
            {SURFACE_RULES.map(([name, rule]) => (
              <li key={name} className="flex flex-col gap-1 px-6 py-4">
                <span className="font-mono text-sm">{name}</span>

                <span className="text-sm text-muted-foreground">{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      </MarketingSection>

      <MarketingSection
        description="Product views share one frame language built from the platform tokens."
        id="product-framing"
        title="Product framing"
      >
        <div className="mt-14 grid gap-10 lg:mt-16 lg:grid-cols-2">
          <ProductPanel className="h-80">
            <ProductWindow className="absolute top-8 left-8 w-[115%]">
              <div className="grid aspect-[16/10] grid-cols-[22%_1fr] gap-3 p-3">
                <div className="rounded-md bg-placeholder" />

                <div className="space-y-2">
                  <div className="h-3 w-1/3 rounded bg-placeholder" />

                  <div className="h-24 rounded-md bg-card" />

                  <div className="h-24 rounded-md bg-card" />
                </div>
              </div>
            </ProductWindow>

            <PhoneFrame className="absolute right-8 -bottom-20 w-32">
              <div className="aspect-[9/19.5] bg-sidebar" />
            </PhoneFrame>
          </ProductPanel>

          <ul className="m-0 list-none divide-y divide-border overflow-hidden rounded-card border border-border bg-card p-0">
            {FRAMING_RULES.map(([name, rule]) => (
              <li key={name} className="flex flex-col gap-1 px-6 py-4">
                <span className="font-mono text-sm">{name}</span>

                <span className="text-sm text-muted-foreground">{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      </MarketingSection>

      <MarketingSection
        description="Motion explains one state change at a time and always has a calm final state."
        id="motion-rules"
        title="Motion"
      >
        <div className="mt-14 grid gap-10 lg:mt-16 lg:grid-cols-2">
          <Steps data-step-progress className="my-0">
            <Step title="Sign in">
              <p>The line fills as the sequence scrolls past.</p>
            </Step>

            <Step title="Connect">
              <p>Each number lights up at the middle of the screen.</p>
            </Step>

            <Step title="Ask">
              <p>Reduced motion shows the plain sequence.</p>
            </Step>
          </Steps>

          <ul className="m-0 list-none divide-y divide-border overflow-hidden rounded-card border border-border bg-card p-0">
            {MOTION_RULES.map(([name, rule]) => (
              <li key={name} className="flex flex-col gap-1 px-6 py-4">
                <span className="text-sm font-medium">{name}</span>

                <span className="text-sm text-muted-foreground">{rule}</span>
              </li>
            ))}
          </ul>
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
