import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { ctaSchema } from "./common";

const featureItemSchema = z.object({
  description: z.string(),
  icon: z.string(),
  title: z.string(),
});
export type FeatureItem = z.infer<typeof featureItemSchema>;

export const featureSchema = z.object({
  features: z.array(featureItemSchema),
  gridCols: z.string().optional(),
  hasSecondaryBackground: z.boolean().optional(),
  subtitle: z.string(),
  title: z.string(),
});
export type Feature = z.infer<typeof featureSchema>;

const heroSchema = z.object({
  buttonLeftHref: z.string(),
  buttonLeftText: z.string(),
  buttonRightHref: z.string(),
  buttonRightText: z.string(),
  description: z.string(),
  hint: z.string(),
  title: z.string(),
});
export type Hero = z.infer<typeof heroSchema>;

const whySchema = z.object({
  description: z.string(),
  features: z.array(featureItemSchema),
  title: z.string(),
});

export const featuresSchema = frontmatterSchema.extend({
  cta: ctaSchema,
  description: z.string(),
  features: z.array(featureSchema),
  hero: heroSchema,
  title: z.string(),
  why: whySchema,
});
