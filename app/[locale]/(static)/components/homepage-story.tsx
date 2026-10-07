import type { HomepageFlow } from "@/core/fumadocs/schemas/homepage";

import { MarketingSection } from "@/components/marketing/marketing-section";

export function HomepageStory({ flow }: { flow: HomepageFlow }) {
  return (
    <MarketingSection id="how-it-works">
      <div className="max-w-3xl">
        <p className="text-eyebrow">{flow.eyebrow}</p>

        <h2 className="text-display-sm mt-5">{flow.title}</h2>
      </div>

      <ol className="mt-12 grid border-t border-border lg:grid-cols-3" data-homepage-rules="full-bleed">
        {flow.steps.map((step, index) => (
          <li
            key={step.title}
            className="grid content-start gap-3 border-b border-border py-7 lg:border-b-0 lg:py-8 lg:pr-8 lg:not-first:border-l lg:not-first:pl-8"
          >
            <span className="text-sm text-muted-foreground tabular-nums">{`${index + 1}.0`}</span>

            <h3 className="text-lg font-medium tracking-tight">{step.title}</h3>

            <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
          </li>
        ))}
      </ol>
    </MarketingSection>
  );
}
