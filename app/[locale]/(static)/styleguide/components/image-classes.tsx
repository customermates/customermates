import type { ReactNode } from "react";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { MediaPlate } from "@/components/marketing/media-plate";
import {
  ChannelsConverge,
  ComparisonVerdict,
  DetailMarked,
  FlowSchematic,
  RecordResolved,
} from "@/components/marketing/illustrations/brand-illustration";

const GRAMMAR_RULES = [
  "The ground is a raised rung. Flat fill, no gradient, no shadow, no perspective.",
  "Neutral shapes are the page ink at two opacities, 0.07 and 0.16. Never a third.",
  "Exactly one element carries the accent. It is the subject of the sentence.",
  "The accent marks what changed, resolved or won. Never what is merely present.",
  "Rounded rectangles and circles only. The radius grows with the shape.",
  "At least a third of the frame stays empty. If it does not, remove an element.",
];

const ILLUSTRATIONS = [
  {
    accent: "the record the conversation landed on",
    element: <RecordResolved />,
    name: "RecordResolved",
    use: "Homepage and feature heroes — a stack where one item is now settled",
  },
  {
    accent: "the single customer every channel meets at",
    element: <ChannelsConverge />,
    name: "ChannelsConverge",
    use: "Industry and integration pages — many inputs, one destination",
  },
  {
    accent: "the column that wins",
    element: <ComparisonVerdict />,
    name: "ComparisonVerdict",
    use: "Comparison and alternative pages — two sets weighed",
  },
  {
    accent: "the one row the page is actually about",
    element: <DetailMarked />,
    name: "DetailMarked",
    use: "Feature pages — one detail inside a larger surface",
  },
];

const SCHEMATIC_RULES = [
  "A node is a rounded rectangle at body opacity with one label bar inside it.",
  "An edge is a 3px stroke at detail opacity, curved only where it must turn.",
  "Every edge ends in an arrowhead. Direction is never left to the reader.",
  "The terminal node carries the accent. Sources and steps never do.",
];

function ThemePair({ children }: { children: ReactNode }) {
  return (
    <div className="marketing-grid gap-y-4">
      <div className="col-span-12 lg:col-span-6">
        <div className="light rounded-card border border-border bg-card p-5 text-foreground">{children}</div>

        <p className="text-meta mt-2.5">Light</p>
      </div>

      <div className="col-span-12 lg:col-span-6">
        <div className="dark rounded-card border border-border bg-card p-5 text-foreground">{children}</div>

        <p className="text-meta mt-2.5">Dark</p>
      </div>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-6 overflow-x-auto rounded-card border border-border bg-card p-5 text-xs leading-relaxed">
      <code className="font-mono">{children}</code>
    </pre>
  );
}

export function ImageClasses() {
  return (
    <>
      <MarketingSection
        description="Four classes cover every picture a public page needs. Each one is authored in light and dark from a single source, because a page can be read in either."
        title="What a picture on a public page may be"
      >
        <div className="marketing-grid mt-14 gap-y-4 lg:mt-16">
          {[
            {
              body: "Token-driven SVG drawn from the grammar below. No model call, no file.",
              title: "Brand illustration",
            },
            { body: "A real capture of the running product, matted in a token frame.", title: "Product proof" },
            { body: "Nodes, edges and one accent, for a flow that words alone would blur.", title: "Schematic" },
            { body: "The 1200×630 card a link unfurls into. Dark on both site themes.", title: "Social card" },
          ].map((item) => (
            <article
              key={item.title}
              className="col-span-12 rounded-card border border-border bg-card p-7 sm:col-span-6 lg:col-span-3"
            >
              <h3 className="m-0 font-medium leading-snug">{item.title}</h3>

              <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
            </article>
          ))}
        </div>
      </MarketingSection>

      <MarketingSection
        description="Six rules produce every illustration below. If one of them looks wrong, the rule that made it is the thing to change."
        title="Class 1 — the brand illustration grammar"
      >
        <div className="marketing-grid mt-14 gap-y-4 lg:mt-16">
          {GRAMMAR_RULES.map((rule, index) => (
            <div
              key={rule}
              className="col-span-12 rounded-card border border-border bg-card p-6 md:col-span-6 lg:col-span-4"
            >
              <code className="font-mono text-sm text-primary">{String(index + 1).padStart(2, "0")}</code>

              <p className="mt-3 text-sm leading-relaxed">{rule}</p>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-16 max-w-3xl text-center">
          <p className="text-lede">
            The neutral ink is <code className="font-mono text-sm text-foreground">var(--foreground)</code> at two
            opacities rather than a colour token, so a shape reads identically on any rung and flips with the theme
            without a second palette.
          </p>
        </div>

        <div className="mt-14 flex flex-col gap-16">
          {ILLUSTRATIONS.map((illustration) => (
            <div key={illustration.name}>
              <div className="mb-6 flex flex-col gap-2 border-t border-border-strong pt-5 lg:flex-row lg:items-baseline lg:justify-between lg:gap-8">
                <code className="font-mono text-sm text-primary">{`<${illustration.name} />`}</code>

                <div className="flex flex-col gap-1 lg:flex-row lg:items-baseline lg:gap-8 lg:text-right">
                  <span className="text-meta">{illustration.use}</span>

                  <span className="text-meta shrink-0">Accent marks {illustration.accent}</span>
                </div>
              </div>

              <ThemePair>{illustration.element}</ThemePair>
            </div>
          ))}
        </div>

        <div className="mx-auto mt-16 max-w-3xl">
          <h3 className="text-display-sm m-0 text-center">Drawing a new one</h3>

          <p className="text-lede mt-5 text-center">
            Add an export to the same module. The viewBox, the ink and the two opacities come from the grammar file, so
            a new illustration cannot drift from the four above.
          </p>

          <CodeBlock>{`import { illustrationSvgProps, ILLUSTRATION_INK, ILLUSTRATION_OPACITY } from "./illustration-grammar";

const BODY = { fill: ILLUSTRATION_INK, opacity: ILLUSTRATION_OPACITY.body };
const DETAIL = { fill: ILLUSTRATION_INK, opacity: ILLUSTRATION_OPACITY.detail };

export function QueueCleared(props: IllustrationProps) {
  return (
    <svg {...illustrationSvgProps(props)}>
      <rect {...BODY} x="96" y="52" width="330" height="52" rx="16" />
      <rect {...DETAIL} x="120" y="71" width="120" height="14" rx="7" />
      <rect fill="var(--primary)" x="148" y="180" width="330" height="52" rx="16" />
    </svg>
  );
}`}</CodeBlock>

          <p className="text-meta mt-5">
            Pass a label only when the picture carries meaning the surrounding text does not. Without one the SVG is
            marked aria-hidden, which is the right default for decoration.
          </p>
        </div>
      </MarketingSection>

      <MarketingSection
        description="A capture is the strongest argument a public page has, so the frame around it must not compete with it."
        title="Class 2 — product proof"
      >
        <div className="marketing-grid mt-14 gap-y-10 lg:mt-16">
          <div className="col-span-12 lg:col-span-6">
            <MediaPlate
              caption='variant="matted" — an 8px card mat and an inner radius. For a screenshot, whose own edges are square.'
              variant="matted"
            >
              <div className="aspect-hero flex items-center justify-center bg-placeholder">
                <span className="text-meta font-mono">screen capture</span>
              </div>
            </MediaPlate>
          </div>

          <div className="col-span-12 lg:col-span-6">
            <MediaPlate caption='variant="flush" — the media meets the rim. For an illustration, which is already drawn to the frame.'>
              <div className="bg-muted">
                <DetailMarked />
              </div>
            </MediaPlate>
          </div>
        </div>

        <div className="mx-auto mt-14 max-w-3xl">
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
            {[
              "Capture at 1920×1080 from a seeded local instance, never the hosted app.",
              "Capture the theme the section is written for, and both if the section is shown in both.",
              "Never crop away the product chrome to make a shot look bigger.",
              "Never composite a state the product cannot actually reach.",
            ].map((rule) => (
              <li key={rule} className="px-6 py-4 text-sm">
                {rule}
              </li>
            ))}
          </ul>
        </div>
      </MarketingSection>

      <MarketingSection
        description="A schematic is allowed where a flow has an order that prose would blur. It uses the same ink and the same accent rule."
        title="Class 3 — schematic"
      >
        <div className="mt-14 lg:mt-16">
          <ThemePair>
            <FlowSchematic />
          </ThemePair>
        </div>

        <div className="mx-auto mt-12 max-w-3xl">
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
            {SCHEMATIC_RULES.map((rule) => (
              <li key={rule} className="px-6 py-4 text-sm">
                {rule}
              </li>
            ))}
          </ul>
        </div>
      </MarketingSection>

      <MarketingSection
        description="A link unfurls in someone else's interface, where our theme does not apply. The card is therefore always dark, on both site themes, so it reads the same everywhere it lands."
        title="Class 4 — social card"
      >
        <div className="mx-auto mt-14 max-w-4xl lg:mt-16">
          <div className="dark">
            <div className="aspect-social flex flex-col justify-between overflow-hidden rounded-card border border-border-strong bg-background p-10 text-foreground sm:p-14">
              <div className="flex items-center gap-3">
                <span className="size-7 rounded-lg bg-primary" />

                <span className="font-medium tracking-tight">Customermates</span>
              </div>

              <p className="text-display-sm m-0 max-w-[80%] text-balance">
                Every conversation lands on the record it belongs to
              </p>

              <div className="flex items-baseline justify-between">
                <span className="text-meta">customermates.com</span>

                <span className="text-meta font-mono">1200 × 630</span>
              </div>
            </div>
          </div>

          <p className="text-meta mt-4">
            One accent mark, the headline at the section-heading size, and the domain. Nothing else fits at the size a
            card is actually seen.
          </p>
        </div>
      </MarketingSection>
    </>
  );
}
