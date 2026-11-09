import type { Metadata } from "next";

import { ResponsiveContract } from "../components/responsive-contract";
import { StyleguideChapter } from "../components/styleguide-chapter";
import { TokenTable, TypeTable } from "../components/style-readout";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { Step, Steps } from "@/components/marketing/process-steps";
import { PhoneFrame, ProductPanel, ProductWindow } from "@/components/marketing/product-window";
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
  { name: "--primary", role: "ink, the primary action" },
  { name: "--mk-agent", role: "ink; an agent moment is a mark and a label, not a colour" },
  { name: "--success", role: "a resolved state" },
  { name: "--warning", role: "an attention state" },
  { name: "--destructive", role: "a destructive state" },
];

const TYPE_ROLES = [
  { className: "mk-hero", sample: "Follow up on every client conversation." },
  { className: "mk-display", sample: "One description. A workspace your agent built." },
  { className: "mk-title", sample: "Replies drafted and waiting for you" },
  {
    className: "mk-lede",
    sample: "Connect LinkedIn and email. Mate drafts the reply and puts the next step on your dashboard.",
  },
  { className: "mk-body", sample: "Playbooks, prices and how you work, written once." },
  { className: "mk-eyebrow", sample: "Every reply, handled" },
  { className: "mk-caption", sample: "No credit card. Cancel anytime. Made in Germany." },
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
    label: "--mk-radius-sm / md / lg / xl",
    role: "buttons and tiles / small panels / cards / stages and the closing panel",
    value: "10 / 14 / 20 / 28px",
  },
  {
    label: "--mk-section-space",
    role: "vertical rhythm between sections (Linear and Apple sit at 128 to 144px)",
    value: "80 → 136px",
  },
  {
    label: "--mk-header-gap",
    role: "space between a section header and its content",
    value: "40 → 64px",
  },
  {
    label: "--mk-measure",
    role: "maximum width of a lede, about 70 characters",
    value: "40rem",
  },
  {
    label: "--mk-ease / --mk-ease-emphasized",
    role: "state changes (Attio's curve) / entrances and lifts",
    value: "cubic-bezier(.2, 0, 0, 1) / (.22, 1, .36, 1)",
  },
  {
    label: "--mk-duration-fast / base / slow",
    role: "press feedback / hover and state / entrances",
    value: "150 / 240 / 600ms",
  },
];

const DEPTH = [
  ["--mk-shadow-ring", "a resting card: a hairline ring, no blur"],
  ["--mk-shadow-sm", "secondary buttons and chips"],
  ["--mk-shadow-md", "a raised panel such as the closing panel"],
  ["--mk-shadow-lg", "the live stage and product windows"],
  ["--mk-shadow-hover", "an interactive card under the pointer, together with a 2px lift"],
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
    "The lit glass tile: a tinted highlight from the top left, a rim and a soft shadow. It carries the hero marks and, tinted with primary, the selected stage tab. Navigation selection stays a neutral pill.",
  ],
  ["Never", "Glass over content that switches between light and dark sections, or on resting content panels."],
  ["Section edges", "In continuous pages a canvas section fades in and out of the page colour over 7rem."],
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
  ["Hero entrance", "mk-enter: the hero's children rise 14px out of a 4px blur, 70ms apart, once on load (900ms)."],
  [
    "Scroll reveal",
    "data-reveal: section headers, cards and panels rise and fade in once through a CSS view timeline. Nothing is hidden where view timelines are not supported.",
  ],
  [
    "Hover",
    "Interactive cards lift 2px and strengthen their ring in 240ms; arrows in buttons and links nudge 2px; chips lift 1px.",
  ],
  ["Press", "Buttons scale to 98 per cent for 150ms."],
  [
    "Live stage",
    "From 40rem, one live demo iframe per tab after hydration with the next tab preloaded; 6s rotation with a progress ring, stopped by any visitor action.",
  ],
  [
    "Restraint",
    "Every motion stops off screen and while the document is hidden, and reduced motion receives the final state.",
  ],
] as const;

const FORBIDDEN = [
  [
    "No accent colour",
    "Buttons, headings, icons, charts and agent moments stay ink, grey and hairline. Only signal colours carry state.",
  ],
  ["No gradient or coloured headline text", "Headlines are ink with an optional grey second clause."],
  [
    "No grid paper or floating logo tiles behind a hero",
    "They read as a template. The hero sits on the page colour with one soft light.",
  ],
  ["No second primary action", "One ink button per section; alternatives use the secondary or ghost button."],
  ["No type size by eye", "Every heading and paragraph uses a class from the type scale."],
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
        description="There is no accent colour. The primary action is ink, an agent moment is marked by the Mate mark or a sparkle in ink with a label, and signal colours carry state and nothing else."
        id="signals"
        title="Ink and signal colours"
      >
        <div className="mt-14 lg:mt-16">
          <TokenTable rows={ACCENTS} />
        </div>
      </MarketingSection>

      <MarketingSection
        description="Inter, two weights. Display at 600 with tracking from -0.018em to -0.042em; body at 400. Sizes are fluid between phone and desktop, measured against Attio (64px hero, 40px sections) and Linear (64 / 48px)."
        id="typography"
        title="Type scale"
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

        <p className="mk-body mt-10">
          Buttons, cards, badges and chips are specified with live examples in the Building blocks chapter.
        </p>
      </MarketingSection>

      <MarketingSection
        description="Depth is a ring first and a shadow only when something floats or responds to the pointer."
        id="depth"
        title="Depth"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {DEPTH.map(([token, role], index) => (
            <div
              key={token}
              className={
                ["mk-card", "mk-card", "mk-card-raised", "mk-card-raised", "mk-card mk-card-interactive"][index] +
                " p-5"
              }
            >
              <code className="font-mono text-xs">{token}</code>

              <p className="mk-caption mt-3">{role}</p>
            </div>
          ))}
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
              className="absolute inset-0 -z-10 bg-[radial-gradient(60%_70%_at_50%_100%,color-mix(in_oklab,var(--foreground)_12%,transparent),transparent)]"
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
