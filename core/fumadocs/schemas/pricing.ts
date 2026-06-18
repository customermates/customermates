import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { ctaSchema, faqSchema } from "./common";

const pricingRowSchema = z.object({
  label: z.string(),
  pro: z.union([z.boolean(), z.string()]),
  enterprise: z.union([z.boolean(), z.string()]),
});

export const pricingTableRowSchema = z.object({
  title: z.string(),
  rows: z.array(pricingRowSchema),
});

export const pricingCardSchema = z.object({
  title: z.string(),
  description: z.string(),
  badge: z.string().optional(),
  price: z.string(),
  priceSubtext: z.string().optional(),
  priceNote: z.string().optional(),
  buttonText: z.string(),
  buttonHref: z.string(),
  buttonColor: z.enum(["default", "primary"]),
  buttonVariant: z.enum(["bordered", "shadow", "solid"]),
  features: z.array(z.string()),
  cardClassName: z.string().optional(),
  shadow: z.enum(["sm", "md"]).optional(),
});
export type PricingCard = z.infer<typeof pricingCardSchema>;

export const pricingDataSchema = z.object({
  ariaLabelSlider: z.string(),
  ariaLabelTabs: z.string(),
  monthly: z.string(),
  pricingCards: z.array(pricingCardSchema),
  users: z.string(),
  yearly: z.string(),
});
export type Pricing = z.infer<typeof pricingDataSchema>;

const comparisonTablePlanSchema = z.object({
  name: z.string(),
  button: z.string(),
  buttonHref: z.string(),
});

export const comparisonTablePlansSchema = z.object({
  pro: comparisonTablePlanSchema,
  enterprise: comparisonTablePlanSchema,
});

export const comparisonTableSchema = z.object({
  header: z.string(),
  plans: comparisonTablePlansSchema,
  sections: z.array(pricingTableRowSchema),
});
export type ComparisonTable = z.infer<typeof comparisonTableSchema>;

export const pricingSchema = frontmatterSchema.extend({
  comparison: comparisonTableSchema,
  cta: ctaSchema,
  description: z.string(),
  faq: faqSchema,
  pricing: pricingDataSchema,
  title: z.string(),
  titleAccent: z.string().optional(),
});
