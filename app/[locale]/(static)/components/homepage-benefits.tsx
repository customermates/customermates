import type { Benefits } from "@/core/fumadocs/schemas/homepage";

import { BarChart3, Bot, Database, Network, SlidersHorizontal, Users } from "lucide-react";

import { MarketingContainer } from "@/components/marketing/marketing-container";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { cn } from "@/core/utils/cn";

type Benefit = Benefits["benefits"][number];

type Props = {
  benefitsSection: Benefits;
};

const GROUP_ICONS = [Users, SlidersHorizontal, Bot, BarChart3, Network, Database] as const;
const GROUP_BENEFIT_ICONS = [
  ["Inbox", "Users", "Briefcase", "FileText"],
  ["LayoutGrid", "Bell", "Filter", "Table"],
  ["Sparkles"],
  ["BarChart3"],
  ["Play", "Code2", "Zap", "Download"],
  ["ShieldCheck", "Server", "Terminal"],
] as const;

function benefitsForGroup(benefits: Benefit[], icons: readonly string[]) {
  const iconSet = new Set(icons);
  return benefits.filter((benefit) => iconSet.has(benefit.icon));
}

export function HomepageBenefits({ benefitsSection }: Props) {
  return (
    <>
      <MarketingSection
        description={benefitsSection.subtitle}
        id="benefits"
        title={benefitsSection.title}
        tone="canvas"
      >
        <p className="text-eyebrow mx-auto mt-5 w-fit">{benefitsSection.badge}</p>

        <div className="marketing-grid mt-14 gap-y-4 lg:mt-16">
          {benefitsSection.groups.map((group, index) => {
            const Icon = GROUP_ICONS[index];
            const benefits = benefitsForGroup(benefitsSection.benefits, GROUP_BENEFIT_ICONS[index]);

            return (
              <article
                key={group.title}
                className="col-span-12 flex min-h-64 flex-col rounded-card border border-border bg-card p-6 sm:col-span-6 lg:col-span-4 lg:p-7"
              >
                <span className="grid size-10 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                  <Icon aria-hidden className="size-[18px]" strokeWidth={1.75} />
                </span>

                <h3 className="mt-7 text-lg font-medium">{group.title}</h3>

                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{group.description}</p>

                <ul
                  className="-mx-6 mt-6 divide-y divide-border border-t border-border lg:-mx-7"
                  data-homepage-rules="full-bleed"
                >
                  {benefits.map((benefit) => (
                    <li key={benefit.title} className="px-6 py-2.5 text-xs leading-relaxed text-foreground/80 lg:px-7">
                      {benefit.title}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </MarketingSection>

      <section className="relative w-full border-y border-border" id="facts">
        <MarketingContainer>
          <div className="grid auto-rows-fr grid-cols-2 lg:grid-cols-5">
            {benefitsSection.metrics.map((metric, index) => (
              <div
                key={metric.figure}
                className={cn(
                  "min-w-0 px-4 py-9 sm:px-6 lg:col-span-1 lg:border-r lg:border-b-0 lg:py-12 lg:last:border-r-0",
                  index === benefitsSection.metrics.length - 1 ? "col-span-2" : "border-b border-border",
                  index % 2 === 0 && index < benefitsSection.metrics.length - 1 ? "border-r border-border" : null,
                )}
              >
                <p className="text-2xl font-medium tracking-tight sm:text-3xl">{metric.figure}</p>

                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{metric.label}</p>
              </div>
            ))}
          </div>
        </MarketingContainer>
      </section>
    </>
  );
}
