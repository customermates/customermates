import type { ComparisonColumn } from "@/components/marketing/responsive-comparison-table";

import { AppImage } from "@/components/shared/app-image";
import { ResponsiveComparisonTable } from "@/components/marketing/responsive-comparison-table";

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
          height={23}
          src="customermates.svg"
          width={229}
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
    <section className="relative mx-auto w-full max-w-5xl px-4 pb-12 pt-4">
      <div className="mb-8">
        <h2 className="text-x-3xl mb-6 text-left">{title}</h2>
      </div>

      <ResponsiveComparisonTable columns={columns} sections={mappedSections} />
    </section>
  );
}
