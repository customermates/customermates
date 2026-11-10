import type { ComparisonTable } from "@/core/fumadocs/schemas/pricing";
import type { ComparisonColumn, ComparisonSection } from "@/components/marketing/responsive-comparison-table";

import { ResponsiveComparisonTable } from "@/components/marketing/responsive-comparison-table";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { SectionHeader } from "@/components/marketing/section-header";
import { formatCommercialAmount, getCommercialOffer, PLAN_IDS, PLAN_CATALOG } from "@/core/commercial/plan-catalog";
import { fileSizeLabel } from "@/core/utils/format-bytes";

type Props = ComparisonTable & { locale: string };

export function pricingComparisonPresentation({
  apiLimitValue,
  customValue,
  locale,
  plans,
  sections,
  unlimitedValue,
  workspaceStorageValue,
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
        const limits = definition.entitlements.usageLimits;
        switch (row.catalogFact) {
          case "monthlyPrice": {
            if (definition.availability === "free") return formatCommercialAmount(0, locale, "EUR");
            const offer = getCommercialOffer(plan, "monthly");
            return offer ? formatCommercialAmount(offer.unitPriceMinor, locale, offer.currency) : customValue;
          }
          case "hostedAiUsage": {
            const multiplier = definition.entitlements.hostedAiUsageMultiplier;
            if (multiplier === null) return false;
            return typeof multiplier === "number" ? `${multiplier}x` : customValue;
          }
          case "maxMembers":
            return limits ? new Intl.NumberFormat(locale).format(limits.maxMembers) : unlimitedValue;
          case "maxRecords":
            return limits ? new Intl.NumberFormat(locale).format(limits.maxRecords) : unlimitedValue;
          case "webhooks":
            return definition.entitlements.webhooks;
          case "apiRequestLimit":
            return limits
              ? apiLimitValue
                  .replace("{perMinute}", new Intl.NumberFormat(locale).format(limits.apiRequestsPerMinute))
                  .replace("{perDay}", new Intl.NumberFormat(locale).format(limits.apiRequestsPerDay))
              : true;
          case "messaging":
            return definition.entitlements.messaging;
          case "includedAccountsPerUser": {
            const allowance = definition.entitlements.includedAccountsPerUser;
            return allowance === "unlimited" ? unlimitedValue : String(allowance);
          }
          case "includedRoutinesPerUser": {
            const allowance = definition.entitlements.includedRoutinesPerUser;
            return allowance === "unlimited" ? unlimitedValue : String(allowance);
          }
          case "sharedAccounts":
            return definition.entitlements.sharedAccounts;
          case "fileStoragePerActiveUser": {
            if (limits) return workspaceStorageValue.replace("{size}", fileSizeLabel(limits.fileStorageBytes, locale));
            const bytes = definition.entitlements.fileStorageBytesPerActiveUser;
            return typeof bytes === "number" ? fileSizeLabel(bytes, locale) : customValue;
          }
        }
      });

      return { label: row.label, values };
    }),
  }));

  return { columns, sections: mappedSections };
}

export function PricingComparisonTable({
  apiLimitValue,
  customValue,
  header,
  locale,
  plans,
  sections,
  unlimitedValue,
  workspaceStorageValue,
}: Props) {
  const presentation = pricingComparisonPresentation({
    apiLimitValue,
    customValue,
    locale,
    plans,
    sections,
    unlimitedValue,
    workspaceStorageValue,
  });

  return (
    <MarketingSection className="mk-section" id="compare">
      <SectionHeader title={header} />

      <ResponsiveComparisonTable header={<span className="sr-only">{header}</span>} {...presentation} />
    </MarketingSection>
  );
}
