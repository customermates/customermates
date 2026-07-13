import type { ComparisonTable } from "@/core/fumadocs/schemas/pricing";
import type { ComparisonColumn, ComparisonSection } from "@/components/marketing/responsive-comparison-table";

import { ResponsiveComparisonTable } from "@/components/marketing/responsive-comparison-table";

type Props = ComparisonTable;

const TIER_KEYS = ["starter", "pro", "business", "enterprise"] as const;

export function PricingComparisonTable({ header, plans, sections }: Props) {
  const columns: ComparisonColumn[] = TIER_KEYS.map((tierKey) => ({
    key: tierKey,
    header: plans[tierKey].name,
    featured: Boolean(plans[tierKey].featured),
  }));

  const mappedSections: ComparisonSection[] = sections.map((section, sectionIndex) => ({
    title: sectionIndex === 0 ? undefined : section.title,
    rows: section.rows.map((row) => ({
      label: row.label,
      values: TIER_KEYS.map((tierKey) => row[tierKey]),
    })),
  }));

  return (
    <section className="relative w-full pb-8">
      <div className="mx-auto max-w-7xl px-4">
        <ResponsiveComparisonTable columns={columns} header={header} sections={mappedSections} />
      </div>
    </section>
  );
}
