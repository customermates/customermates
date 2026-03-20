import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { ctaSchema, faqSchema } from "./common";

const heroSchema = z.object({
  title: z.string(),
  description: z.string(),
  buttonLeftText: z.string(),
  buttonLeftHref: z.string(),
  buttonRightText: z.string(),
  buttonRightHref: z.string(),
  hint: z.string(),
});
export type Hero = z.infer<typeof heroSchema>;

const comparisonRowSchema = z.object({
  name: z.string(),
  source: z.union([z.boolean(), z.string()]),
  competitor: z.union([z.boolean(), z.string()]),
});

const comparisonSectionSchema = z.object({
  title: z.string(),
  features: z.array(comparisonRowSchema),
});

export const comparisonTableSchema = z.object({
  competitorName: z.string(),
  title: z.string(),
  sections: z.array(comparisonSectionSchema),
});
export type ComparisonTable = z.infer<typeof comparisonTableSchema>;

export const affiliateSchema = frontmatterSchema.extend({
  hero: heroSchema,
  comparison: comparisonTableSchema,
  cta: ctaSchema,
  faq: faqSchema,
});
