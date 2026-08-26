import type { Metadata } from "next";

import { StyleguideChapter } from "./components/styleguide-chapter";
import { STYLEGUIDE_CHAPTERS } from "./components/styleguide-chapters";

import { MarketingContainer } from "@/components/marketing/marketing-container";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { IntlLink } from "@/i18n/navigation";

export const metadata: Metadata = {
  title: "Marketing visual system",
};

const DECISIONS = [
  {
    answer: "None",
    body: "Let the words and layout carry the section when a visual would only repeat the headline or decorate empty space.",
    question: "Does the section earn a visual?",
  },
  {
    answer: "Brand illustration",
    body: "Choose the closest relationship, handoff or focus pathway, then author the composition that best explains this particular story.",
    question: "Is the point conceptual?",
  },
  {
    answer: "Product proof",
    body: "Use an explicit capture of reachable seeded local state when the section makes an argument about the product itself.",
    question: "Is real product evidence required?",
  },
] as const;

export default function StyleguidePage() {
  return (
    <StyleguideChapter chapter="overview">
      <MarketingSection
        description="Read only the chapter that owns the decision in front of you. The guide is split so the visual specimens keep the full marketing width without turning navigation into a second layout column."
        id="orientation"
        title="How to use the guide"
      >
        <div className="marketing-grid mt-12 gap-y-4">
          <div className="col-span-12 rounded-card border border-border bg-card p-6 md:col-span-4">
            <code className="font-mono text-sm text-primary">01</code>

            <h3 className="mt-4 font-medium">Choose structure</h3>

            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Pick one of the eleven patterns and keep its authored collapse behaviour.
            </p>
          </div>

          <div className="col-span-12 rounded-card border border-border bg-card p-6 md:col-span-4">
            <code className="font-mono text-sm text-primary">02</code>

            <h3 className="mt-4 font-medium">Choose authenticity</h3>

            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Default to a brand illustration, request product proof explicitly, or decide that the section needs none.
            </p>
          </div>

          <div className="col-span-12 rounded-card border border-border bg-card p-6 md:col-span-4">
            <code className="font-mono text-sm text-primary">03</code>

            <h3 className="mt-4 font-medium">Calibrate, then compose</h3>

            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Use the registered pathway golden to learn the quality floor. It is a benchmark, not a required layout
              choice for the next visual.
            </p>
          </div>
        </div>
      </MarketingSection>

      <MarketingSection
        description="The prose selects a family; it never silently turns a claim into product evidence."
        id="decision-tree"
        title="Visual decision tree"
      >
        <ol className="mt-12 overflow-hidden rounded-card border border-border bg-card">
          {DECISIONS.map((decision, index) => (
            <li
              key={decision.question}
              className="grid gap-3 border-b border-border p-6 last:border-b-0 md:grid-cols-[3rem_1fr_12rem] md:items-baseline"
            >
              <code className="font-mono text-sm text-primary">{String(index + 1).padStart(2, "0")}</code>

              <div>
                <h3 className="m-0 font-medium">{decision.question}</h3>

                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{decision.body}</p>
              </div>

              <span className="text-sm font-medium md:text-right">{decision.answer}</span>
            </li>
          ))}
        </ol>
      </MarketingSection>

      <section className="marketing-section" id="chapter-map">
        <MarketingContainer>
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-display-sm m-0">Chapter map</h2>

            <p className="text-lede mx-auto mt-5">
              Foundations constrain every chapter. Patterns arrange the page. Visuals and motion explain one idea
              without pretending to be the application.
            </p>
          </div>

          <div className="marketing-grid mt-12 gap-y-4">
            {STYLEGUIDE_CHAPTERS.filter((chapter) => chapter.id !== "overview").map((chapter) => (
              <IntlLink
                key={chapter.id}
                className="marketing-transition col-span-12 rounded-card border border-border bg-card p-6 hover:border-border-strong sm:col-span-6"
                href={chapter.href}
              >
                <span className="font-medium">{chapter.label}</span>

                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{chapter.description}</p>
              </IntlLink>
            ))}
          </div>
        </MarketingContainer>
      </section>
    </StyleguideChapter>
  );
}
