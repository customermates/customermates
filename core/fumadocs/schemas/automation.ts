import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { ctaSchema, faqSchema, featuresSchema } from "./common";

const architectureSchema = z.object({
  boundary: z.string(),
  crmDescription: z.string(),
  crmTitle: z.string(),
  description: z.string(),
  interfaceTitle: z.string(),
  title: z.string(),
  workflowDescription: z.string(),
});

const benefitItemSchema = z.object({
  description: z.string(),
  icon: z.string(),
  title: z.string(),
});

export const benefitsSchema = z.object({
  benefits: z.array(benefitItemSchema),
});
export type Benefits = z.infer<typeof benefitsSchema>;

export const heroSchema = z.object({
  buttonLeftHref: z.string(),
  buttonLeftText: z.string(),
  buttonRightHref: z.string(),
  buttonRightText: z.string(),
  startFree: z.string(),
  subtitle: z.string(),
  title: z.string(),
  titleAccent: z.string().optional(),
});
export type Hero = z.infer<typeof heroSchema>;

export const automationSchema = frontmatterSchema.extend({
  architecture: architectureSchema,
  benefits: benefitsSchema,
  cta: ctaSchema,
  description: z.string(),
  faq: faqSchema,
  features: featuresSchema,
  hero: heroSchema,
  title: z.string(),
});
