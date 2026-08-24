import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { ctaSchema, faqSchema, seoOverrideFields } from "./common";
import { PLAN_IDS } from "@/core/commercial/plan-catalog";

const manualPricingRowSchema = z.object({
  label: z.string(),
  starter: z.union([z.boolean(), z.string()]),
  pro: z.union([z.boolean(), z.string()]),
  business: z.union([z.boolean(), z.string()]),
  enterprise: z.union([z.boolean(), z.string()]),
});

const catalogPricingRowSchema = z.object({
  label: z.string(),
  catalogFact: z.enum(["monthlyPrice", "messaging", "includedAccountsPerUser", "sharedAccounts"]),
});

const pricingRowSchema = z.union([manualPricingRowSchema, catalogPricingRowSchema]);

export const pricingTableRowSchema = z.object({
  title: z.string(),
  rows: z.array(pricingRowSchema),
});

export const pricingCardSchema = z.object({
  plan: z.enum(PLAN_IDS),
  title: z.string(),
  description: z.string(),
  badge: z.string().optional(),
  buttonText: z.string(),
  buttonHref: z.string(),
  buttonColor: z.enum(["default", "primary"]),
  buttonVariant: z.enum(["bordered", "shadow", "solid"]),
  features: z.array(z.string()),
  featured: z.boolean().optional(),
  cardClassName: z.string().optional(),
  shadow: z.enum(["sm", "md"]).optional(),
});
export type PricingCard = z.infer<typeof pricingCardSchema>;

export const pricingDataSchema = z
  .object({
    ariaLabelSlider: z.string(),
    customPrice: z.string(),
    footnote: z.string().optional(),
    pricingCards: z.array(pricingCardSchema),
    users: z.string(),
    totalSuffixSingular: z.string().optional(),
    totalSuffixPlural: z.string().optional(),
  })
  .superRefine((data, context) => {
    for (const plan of PLAN_IDS) {
      const count = data.pricingCards.filter((card) => card.plan === plan).length;
      if (count !== 1) {
        context.addIssue({
          code: "custom",
          path: ["pricingCards"],
          message: `Pricing cards must contain exactly one ${plan} plan; received ${count}`,
        });
      }
    }
  });
export type Pricing = z.infer<typeof pricingDataSchema>;

const comparisonTablePlanSchema = z.object({
  name: z.string(),
  button: z.string(),
  buttonHref: z.string(),
  featured: z.boolean().optional(),
});

export const comparisonTablePlansSchema = z.object({
  starter: comparisonTablePlanSchema,
  pro: comparisonTablePlanSchema,
  business: comparisonTablePlanSchema,
  enterprise: comparisonTablePlanSchema,
});

export const comparisonTableSchema = z.object({
  customValue: z.string(),
  header: z.string(),
  unlimitedValue: z.string(),
  plans: comparisonTablePlansSchema,
  sections: z.array(pricingTableRowSchema),
});
export type ComparisonTable = z.infer<typeof comparisonTableSchema>;

export const pricingSchema = frontmatterSchema.extend({
  ...seoOverrideFields,
  comparison: comparisonTableSchema,
  cta: ctaSchema,
  description: z.string(),
  faq: faqSchema,
  pricing: pricingDataSchema,
  title: z.string(),
  titleAccent: z.string().optional(),
});
