import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { ctaSchema, faqSchema, featuresSchema, testimonialsSchema } from "./common";
import { pricingDataSchema } from "./pricing";

const automationExplanationSchema = z.string();

const benefitItemSchema = z.object({
  description: z.string(),
  icon: z.string(),
  title: z.string(),
});

export const benefitsSchema = z.object({
  benefits: z.array(benefitItemSchema),
});
export type Benefits = z.infer<typeof benefitsSchema>;

export type Testimonials = z.infer<typeof testimonialsSchema>;

export const heroSchema = z.object({
  buttonLeftHref: z.string(),
  buttonLeftText: z.string(),
  buttonRightHref: z.string(),
  buttonRightText: z.string(),
  startFree: z.string(),
  subtitle: z.string(),
  title: z.string(),
});
export type Hero = z.infer<typeof heroSchema>;

export const pricingTitleSchema = z.object({
  subtitle: z.string(),
  title: z.string(),
});
export type PricingTitle = z.infer<typeof pricingTitleSchema>;

const rootMetadataSchema = z.object({
  defaultDescription: z.string(),
  defaultTitle: z.string(),
  icon: z.string(),
  titleTemplate: z.string(),
});
export type RootMetadata = z.infer<typeof rootMetadataSchema>;

export const homepageSchema = frontmatterSchema.extend({
  automationExplanation: automationExplanationSchema,
  benefits: benefitsSchema,
  cta: ctaSchema,
  description: z.string(),
  faq: faqSchema,
  features: featuresSchema,
  hero: heroSchema,
  pricing: pricingDataSchema.optional(),
  pricingTitle: pricingTitleSchema.optional(),
  rootMetadata: rootMetadataSchema,
  testimonials: testimonialsSchema,
  title: z.string(),
});
