import type { ComparisonColumn } from "@/components/marketing/responsive-comparison-table";

import { AppImage } from "@/components/shared/app-image";
import { ResponsiveComparisonTable } from "@/components/marketing/responsive-comparison-table";
import { MarketingSection } from "@/components/marketing/marketing-section";

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

export function ComparisonTable({ competitor2Name, competitorName, sections, title }: ComparisonTableProps) {
  const columns: ComparisonColumn[] = [
    {
      key: "source",
      header: (
        <AppImage
          alt="Customermates"
          className="mx-auto h-auto w-full max-w-[130px]"
          height={27}
          src="customermates.svg"
          width={150}
        />
      ),
    },
    { key: "competitor", header: competitorName },
    ...(competitor2Name ? [{ key: "competitor2", header: competitor2Name }] : []),
  ];

  const mappedSections = sections.map((section) => ({
    title: section.title,
    rows: section.features.map((feature) => ({
      label: feature.name,
      values: competitor2Name
        ? [feature.source, feature.competitor, feature.competitor2 ?? ""]
        : [feature.source, feature.competitor],
    })),
  }));

  return (
    <MarketingSection className="py-16 sm:py-20 lg:py-24">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 border-b border-border pb-7">
          <h2 className="text-display-sm m-0">{title}</h2>
        </div>

        <ResponsiveComparisonTable columns={columns} sections={mappedSections} />
      </div>
    </MarketingSection>
  );
}
