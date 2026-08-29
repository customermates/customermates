import type { ComparisonTable } from "@/core/fumadocs/schemas/pricing";
import type { ComparisonColumn, ComparisonSection } from "@/components/marketing/responsive-comparison-table";

import { ResponsiveComparisonTable } from "@/components/marketing/responsive-comparison-table";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { formatCommercialAmount, getCommercialOffer, PLAN_IDS, PLAN_CATALOG } from "@/core/commercial/plan-catalog";

type Props = ComparisonTable & { locale: string };

export function pricingComparisonPresentation({
  customValue,
  locale,
  plans,
  sections,
  unlimitedValue,
}: Omit<Props, "header">) {
  const columns: ComparisonColumn[] = PLAN_IDS.map((tierKey) => ({
    key: tierKey,
    header: plans[tierKey].name,
    featured: Boolean(plans[tierKey].featured),
  }));

  const mappedSections: ComparisonSection[] = sections.map((section, sectionIndex) => ({
    title: sectionIndex === 0 ? undefined : section.title,
    rows: section.rows.map((row) => {
      if (!("catalogFact" in row)) {
        return {
          label: row.label,
          values: PLAN_IDS.map((tierKey) => row[tierKey]),
        };
      }

      const values = PLAN_IDS.map((plan) => {
        const definition = PLAN_CATALOG[plan];
        switch (row.catalogFact) {
          case "monthlyPrice": {
            const offer = getCommercialOffer(plan, "monthly");
            return offer ? formatCommercialAmount(offer.unitPriceMinor, locale, offer.currency) : customValue;
          }
          case "messaging":
            return definition.entitlements.messaging;
          case "includedAccountsPerUser": {
            const allowance = definition.entitlements.includedAccountsPerUser;
            return allowance === "unlimited" ? unlimitedValue : String(allowance);
          }
          case "sharedAccounts":
            return definition.entitlements.sharedAccounts;
        }
      });

      return { label: row.label, values };
    }),
  }));

  return { columns, sections: mappedSections };
}

export function PricingComparisonTable({ customValue, header, locale, plans, sections, unlimitedValue }: Props) {
  const presentation = pricingComparisonPresentation({
    customValue,
    locale,
    plans,
    sections,
    unlimitedValue,
  });

  return (
    <MarketingSection className="py-16 sm:py-20 lg:py-24">
      <h2 className="text-display-sm mb-10">{header}</h2>

      <ResponsiveComparisonTable header={<span className="sr-only">{header}</span>} {...presentation} />
    </MarketingSection>
  );
}
