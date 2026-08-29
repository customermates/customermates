import type { Feature } from "@/core/fumadocs/schemas/features";

import { MarketingSection } from "@/components/marketing/marketing-section";
import { Icon } from "@/components/shared/icon";
import { ICONS } from "@/components/shared/icons";

type Props = Feature & { index?: number };

export function BaseFeaturesSection({ features, index, subtitle, title }: Props) {
  const numberLabel = typeof index === "number" ? String(index + 1).padStart(2, "0") : null;

  return (
    <MarketingSection className="py-16 sm:py-20 lg:py-24">
      <div className="marketing-grid gap-y-10">
        <div className="col-span-12 lg:col-span-4">
          {numberLabel ? <p className="text-eyebrow">{numberLabel}</p> : null}

          <h2 className="text-display-sm mt-4">{title}</h2>

          <p className="mt-5 max-w-sm text-sm leading-6 text-muted-foreground">{subtitle}</p>
        </div>

        <div className="col-span-12 grid border-l border-t border-border sm:grid-cols-2 lg:col-start-6 lg:col-end-13">
          {features.map((feature) => {
            const IconComponent = ICONS[feature.icon];

            return (
              <article key={feature.title} className="border-b border-r border-border bg-background p-5 sm:p-6">
                <span className="grid size-8 place-items-center rounded-md border border-border bg-sidebar text-muted-foreground">
                  <Icon aria-hidden icon={IconComponent} size="sm" />
                </span>

                <h3 className="mt-5 text-sm font-semibold text-foreground">{feature.title}</h3>

                <p className="mt-2 text-sm leading-6 text-muted-foreground">{feature.description}</p>
              </article>
            );
          })}
        </div>
      </div>
    </MarketingSection>
  );
}
