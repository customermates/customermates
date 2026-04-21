"use client";

import { CheckIcon, XIcon } from "lucide-react";

import { AppCard } from "@/components/card/app-card";
import { AppImage } from "@/components/shared/app-image";
import { cn } from "@/lib/utils";

export type ComparisonFeature = {
  competitor: string | boolean;
  competitor2?: string | boolean;
  name: string;
  source: string | boolean;
};

export type ComparisonSection = {
  features: ComparisonFeature[];
  title: string;
};

export type ComparisonTableProps = {
  competitor2Name?: string;
  competitorName: string;
  sections: ComparisonSection[];
  title: string;
};

function ComparisonCell({ value }: { value: string | boolean }) {
  if (typeof value === "boolean") {
    return (
      <div className="flex items-center justify-center px-6">
        {value ? (
          <CheckIcon className="mx-auto size-5 text-primary dark:text-primary" />
        ) : (
          <XIcon className="mx-auto size-5 text-muted-foreground" />
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center px-6">
      <span className="text-x-sm block text-center">{value}</span>
    </div>
  );
}

export function ComparisonTable({ competitor2Name, competitorName, sections, title }: ComparisonTableProps) {
  const hasTwoCompetitors = Boolean(competitor2Name);
  const gridCols = hasTwoCompetitors ? "grid-cols-4" : "grid-cols-3";

  return (
    <section className="relative mx-auto w-full max-w-5xl px-4 pb-12 pt-4">
      <div className="mb-8">
        <h2 className="text-x-3xl mb-6 text-left">{title}</h2>
      </div>

      <div className="overflow-x-auto">
        <AppCard className="min-w-[500px] overflow-hidden">
          <div className={cn("grid gap-0 py-6", gridCols)}>
            <div className="px-6" />

            <div className="flex flex-col items-center justify-center px-6">
              <AppImage alt="Customermates" height={27} src="customermates.svg" width={150} />
            </div>

            <div className="flex flex-col items-center justify-center px-6">
              <span className="text-x-lg block text-center">{competitorName}</span>
            </div>

            {hasTwoCompetitors ? (
              <div className="flex flex-col items-center justify-center px-6">
                <span className="text-x-lg block text-center">{competitor2Name}</span>
              </div>
            ) : null}
          </div>

          {sections.map((section, sectionIndex) => (
            <div key={sectionIndex}>
              <div className={cn("grid gap-0 py-3 bg-muted/20 dark:bg-muted/40 border-t border-border/50", gridCols)}>
                <div className="flex items-center px-6">
                  <h3 className="font-semibold text-base">{section.title}</h3>
                </div>

                <div />

                <div />

                {hasTwoCompetitors ? <div /> : null}
              </div>

              {section.features.map((feature, featureIndex) => (
                <div
                  key={featureIndex}
                  className={cn(
                    "grid gap-0 py-3 border-t border-border/50 hover:bg-muted/30 transition-colors",
                    gridCols,
                  )}
                >
                  <div className="flex items-center px-6">
                    <span className="text-x-sm text-subdued">{feature.name}</span>
                  </div>

                  <div>
                    <ComparisonCell value={feature.source} />
                  </div>

                  <div>
                    <ComparisonCell value={feature.competitor} />
                  </div>

                  {hasTwoCompetitors ? (
                    <div>
                      <ComparisonCell value={feature.competitor2 ?? ""} />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </AppCard>
      </div>
    </section>
  );
}
