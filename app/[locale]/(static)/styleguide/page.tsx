import type { Metadata } from "next";

import { StyleguideChapter } from "./components/styleguide-chapter";
import { STYLEGUIDE_CHAPTERS } from "./components/styleguide-chapters";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { IntlLink } from "@/i18n/navigation";
import { enableStaticLocale, type StaticLocaleProps } from "@/i18n/static-locale";

export const metadata: Metadata = {
  title: "Customermates design system",
};

const PRINCIPLES = [
  {
    body: "One idea per screen: a headline of five to nine words, a lede of one or two lines and a lot of air. If a section needs a second idea, it becomes a second section.",
    title: "One idea per screen",
  },
  {
    body: "Ink on paper. Near-black text and primary buttons on light, near-white on dark, greys and hairlines in between. There is no accent colour. An agent moment, such as a draft or an added next step, carries the Mate mark or a sparkle in ink with a label, never a tint.",
    title: "Ink on paper, no accent",
  },
  {
    body: "Show the real product, staged like a product shot: the live demo workspace, the follow-up scene, the composer prompt. One believable company per page, never abstract dashboards or stock imagery.",
    title: "The product is the hero",
  },
  {
    body: "Two weights (400 and 600), tracking that tightens as type grows, and the second clause of a title in grey. Sizes come from the type scale only; nothing is set by eye.",
    title: "Typographic discipline",
  },
  {
    body: "Hero content enters once on load, everything below rises as it scrolls into view, cards lift two pixels on hover. Motion is CSS only, never hides content without support, and switches off for reduced motion.",
    title: "Calm, purposeful motion",
  },
  {
    body: "Every page is assembled from the same building blocks: MarketingHero, SectionHeader, MarketingButton, the card and badge classes and CTASection. A page that needs a new block adds it here first.",
    title: "One kit, every page",
  },
] as const;

const REFERENCES = [
  {
    name: "Attio",
    takes: [
      "Centred hero: chip, short headline, two-line grey lede, black primary button next to a quiet secondary.",
      "Headlines that start in ink and finish in grey.",
      "Buttons 36 to 46 px tall with 10 to 12 px corners; Inter at 600 for display.",
      "Real product crops in calm frames instead of illustrations.",
    ],
  },
  {
    name: "Linear",
    takes: [
      "Restraint: almost monochrome, one accent, dense but legible UI.",
      "Section rhythm of about 128 px and editorial headers.",
      "Fast, subtle state changes (100 to 250 ms) and precise hover feedback.",
      "Product moments treated like film stills, isometric line-art for concepts.",
    ],
  },
  {
    name: "Apple",
    takes: [
      "Scale and whitespace: big confident type, one message per viewport.",
      "Sticky navigation on a solid bar, so nothing shows through it while scrolling.",
      "Scroll-driven reveals that ease content into place.",
      "Generous touch targets on phones (44 px and up).",
    ],
  },
] as const;

const SELLING = [
  [
    "Above the fold",
    "Headline names the outcome, lede names the mechanism, one black primary action, a secondary that removes risk (film, demo, talk to Ben).",
  ],
  [
    "Proof before the ask",
    "The film and the live workspace come directly after the hero, so a visitor sees the product before any feature list.",
  ],
  [
    "One primary action per section",
    "Every section ends in at most one primary button. The same trial action repeats; it is never replaced by a different one.",
  ],
  [
    "Plans in plain words",
    "Price, who it is for and the one thing it unlocks. The featured plan is the one we want most people on.",
  ],
  [
    "Objections answered",
    "FAQ covers keeping your current CRM, what the agent may send and what is free. The founder contact is one click away.",
  ],
  ["Close with the ask", "Every page ends in the closing panel with the trial action and a human alternative."],
] as const;

const DECISIONS = [
  {
    answer: "None",
    body: "Let the words and layout carry the section when a visual would only repeat the headline or decorate empty space.",
    question: "Does the section earn a visual?",
  },
  {
    answer: "Signature visual",
    body: "Use the composer prompt, the follow-up desk, the operating-system stack or the live stage when the point is about what the product does.",
    question: "Is it about the product's behaviour?",
  },
  {
    answer: "Product proof",
    body: "Use the live demo workspace or an explicit capture of seeded demo state when the section makes an argument about the product itself.",
    question: "Is real product evidence required?",
  },
] as const;

export default async function StyleguidePage({ params }: StaticLocaleProps) {
  await enableStaticLocale(params);

  return (
    <StyleguideChapter chapter="overview">
      <MarketingSection
        description="Six rules decide every page. They are short on purpose: apply them before anything is designed."
        eyebrow="The system"
        id="principles"
        title="Principles. What every page follows."
      >
        <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {PRINCIPLES.map((principle, index) => (
            <li key={principle.title} data-reveal className="mk-card p-6">
              <span className="font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>

              <h3 className="mk-title mt-4">{principle.title}</h3>

              <p className="mk-body mt-2">{principle.body}</p>
            </li>
          ))}
        </ol>
      </MarketingSection>

      <MarketingSection
        description="Three references, measured on their live sites on 6 November 2026. We borrow principles, never layouts or assets."
        eyebrow="Baseline"
        id="references"
        title="Attio, Linear and Apple. What we take from each."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {REFERENCES.map((reference) => (
            <section key={reference.name} data-reveal className="mk-card p-6">
              <h3 className="mk-title">{reference.name}</h3>

              <ul className="mt-4 space-y-3">
                {reference.takes.map((take) => (
                  <li key={take} className="mk-body flex gap-3">
                    <span aria-hidden className="mt-2.5 size-1 shrink-0 rounded-full bg-foreground/40" />

                    {take}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </MarketingSection>

      <MarketingSection
        description="A page is finished when it passes all six. Review new pages against this list before they ship."
        eyebrow="Conversion"
        id="selling"
        title="Selling checklist. Every page, every time."
      >
        <div data-reveal className="mk-card overflow-hidden">
          <ul className="divide-y divide-border">
            {SELLING.map(([rule, body]) => (
              <li key={rule} className="grid gap-2 px-6 py-5 md:grid-cols-[14rem_1fr] md:gap-8">
                <span className="text-sm font-medium">{rule}</span>

                <span className="mk-body">{body}</span>
              </li>
            ))}
          </ul>
        </div>
      </MarketingSection>

      <MarketingSection
        description="The prose selects a family; it never silently turns a claim into product evidence."
        eyebrow="Visuals"
        id="decision-tree"
        title="Visual decision tree"
      >
        <ol data-reveal className="mk-card overflow-hidden">
          {DECISIONS.map((decision, index) => (
            <li
              key={decision.question}
              className="grid gap-3 border-b border-border p-6 last:border-b-0 md:grid-cols-[3rem_1fr_12rem] md:items-baseline"
            >
              <code className="font-mono text-sm text-muted-foreground">{String(index + 1).padStart(2, "0")}</code>

              <div>
                <h3 className="m-0 font-medium">{decision.question}</h3>

                <p className="mk-body mt-2">{decision.body}</p>
              </div>

              <span className="text-sm font-medium md:text-right">{decision.answer}</span>
            </li>
          ))}
        </ol>
      </MarketingSection>

      <MarketingSection
        description="Foundations constrain everything. Building blocks are what pages are made of. Patterns arrange them. Visuals explain one idea."
        eyebrow="Chapters"
        id="chapter-map"
        title="Chapter map"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {STYLEGUIDE_CHAPTERS.filter((chapter) => chapter.id !== "overview").map((chapter) => (
            <IntlLink key={chapter.id} className="mk-card mk-card-interactive group block p-6" href={chapter.href}>
              <span className="mk-title">{chapter.label}</span>

              <p className="mk-body mt-2">{chapter.description}</p>
            </IntlLink>
          ))}
        </div>
      </MarketingSection>
    </StyleguideChapter>
  );
}
