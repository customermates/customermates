"use client";

import { XComparisonCell } from "./x-comparison-cell";

import { XCard } from "@/components/x-card/x-card";
import { XImage } from "@/components/x-image";

export type ComparisonFeature = {
  name: string;
  source: string | boolean;
  competitor: string | boolean;
  competitor2?: string | boolean;
};

export type ComparisonSection = {
  title: string;
  features: ComparisonFeature[];
};

export type XComparisonTableProps = {
  competitorName: string;
  competitor2Name?: string;
  title: string;
  sections: ComparisonSection[];
};

export function XComparisonTable({ competitorName, competitor2Name, sections, title }: XComparisonTableProps) {
  const hasTwoCompetitors = !!competitor2Name;
  const gridCols = hasTwoCompetitors ? "grid-cols-4" : "grid-cols-3";

  return (
    <section className="pb-12 pt-4 w-full max-w-5xl mx-auto px-4">
      <div className="mb-8">
        <h2 className="text-x-3xl mb-6 text-left">{title}</h2>
      </div>

      <div className="max-w-7xl mx-auto overflow-x-auto">
        <XCard className="bg-transparent min-w-[500px] max-w-full">
          <div className={`grid ${gridCols} gap-0 py-6 bg-content1`}>
            <div className="flex items-center px-6 text-x-xl" />

            <div className="flex flex-col items-center justify-center px-6 border-r border-divider">
              <XImage alt="Customermates" height={27} src="customermates.svg" width={150} />
            </div>

            <div className={`flex flex-col items-center justify-center px-6 ${hasTwoCompetitors ? "border-r border-divider" : ""}`}>
              <span className="text-x-lg text-center">{competitorName}</span>
            </div>

            {hasTwoCompetitors && (
              <div className="flex flex-col items-center justify-center px-6">
                <span className="text-x-lg text-center">{competitor2Name}</span>
              </div>
            )}
          </div>

          {sections.map((section, sectionIndex) => (
            <div key={sectionIndex}>
              <div className={`grid ${gridCols} gap-0 py-3 border-b border-divider bg-content1`}>
                <div className="flex items-center px-6 border-r border-divider">
                  <h3 className="text-x-md">{section.title}</h3>
                </div>

                <div className="border-r border-divider" />

                <div className={hasTwoCompetitors ? "border-r border-divider" : ""} />

                {hasTwoCompetitors && <div />}
              </div>

              {section.features.map((feature, featureIndex) => (
                <div
                  key={`${sectionIndex}-${featureIndex}`}
                  className={`grid ${gridCols} gap-0 py-3 hover:bg-content1 transition-colors border-b border-divider last:border-b-0`}
                >
                  <div className="flex items-center px-6 border-r border-divider">
                    <span className="text-x-sm text-subdued">{feature.name}</span>
                  </div>

                  <div className="border-r border-divider">
                    <XComparisonCell value={feature.source} />
                  </div>

                  <div className={hasTwoCompetitors ? "border-r border-divider" : ""}>
                    <XComparisonCell value={feature.competitor} />
                  </div>

                  {hasTwoCompetitors && (
                    <div>
                      <XComparisonCell value={feature.competitor2 ?? ""} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </XCard>
      </div>
    </section>
  );
}
