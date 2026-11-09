import type { ComparisonColumn } from "@/components/marketing/responsive-comparison-table";

import { AppImage } from "@/components/shared/app-image";
import { ORGANIZATION_NAME } from "@/core/seo/schemas";
import { ResponsiveComparisonTable } from "@/components/marketing/responsive-comparison-table";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { SectionHeader } from "@/components/marketing/section-header";

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
  eyebrow?: string;
  sections: ComparisonSection[];
  title: string;
};

export function ComparisonTable({ competitor2Name, competitorName, eyebrow, sections, title }: ComparisonTableProps) {
  const columns: ComparisonColumn[] = [
    {
      featured: true,
      key: "source",
      label: ORGANIZATION_NAME,
      header: (
        <AppImage
          alt={ORGANIZATION_NAME}
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
    <MarketingSection className="mk-section" id="comparison">
      <SectionHeader eyebrow={eyebrow} title={title} />

      <div className="mx-auto mt-12 max-w-5xl">
        <ResponsiveComparisonTable columns={columns} sections={mappedSections} />
      </div>
    </MarketingSection>
  );
}
