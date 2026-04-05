import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { ctaSchema, heroSchema } from "./common";

export const comparisonFeatureSchema = z.object({
  name: z.string(),
  source: z.union([z.boolean(), z.string()]),
  competitor: z.union([z.boolean(), z.string()]),
  competitor2: z.union([z.boolean(), z.string()]).optional(),
});
export type ComparisonFeature = z.infer<typeof comparisonFeatureSchema>;

export const comparisonItemSchema = z.object({
  title: z.string(),
  features: z.array(comparisonFeatureSchema),
});
export type ComparisonItem = z.infer<typeof comparisonItemSchema>;

export const comparisonTableSchema = z.object({
  competitorName: z.string(),
  competitor2Name: z.string().optional(),
  sections: z.array(comparisonItemSchema),
  title: z.string(),
});
export type ComparisonTable = z.infer<typeof comparisonTableSchema>;

export const compareSchema = frontmatterSchema.extend({
  comparison: comparisonTableSchema,
  cta: ctaSchema,
  description: z.string(),
  hero: heroSchema,
  competitorName: z.string(),
  title: z.string(),
});
