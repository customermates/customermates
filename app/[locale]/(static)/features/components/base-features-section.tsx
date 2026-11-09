import type { Feature } from "@/core/fumadocs/schemas/features";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { SectionHeader } from "@/components/marketing/section-header";
import { Icon } from "@/components/shared/icon";
import { ICONS } from "@/components/shared/icons";

type Props = Feature & { index?: number };

export function BaseFeaturesSection({ features, index, subtitle, title }: Props) {
  const numberLabel = typeof index === "number" ? String(index + 1).padStart(2, "0") : undefined;

  return (
    <MarketingSection className="mk-section-tight">
      <div className="marketing-grid gap-y-10">
        <div className="col-span-12 lg:sticky lg:top-24 lg:col-span-4 lg:self-start">
          <SectionHeader align="start" description={subtitle} eyebrow={numberLabel} title={title} />
        </div>

        <ul className="col-span-12 grid gap-3 sm:grid-cols-2 lg:col-start-6 lg:col-end-13">
          {features.map((feature) => {
            const IconComponent = ICONS[feature.icon];

            return (
              <li key={feature.title} data-reveal className="mk-card p-6">
                <span
                  aria-hidden
                  className="grid size-8 place-items-center rounded-md border border-border bg-card text-foreground"
                >
                  <Icon aria-hidden icon={IconComponent} size="sm" />
                </span>

                <h3 className="mt-5 text-[0.9375rem] font-semibold tracking-tight text-foreground">{feature.title}</h3>

                <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.description}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </MarketingSection>
  );
}
