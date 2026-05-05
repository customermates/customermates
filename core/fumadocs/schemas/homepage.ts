import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { ctaSchema, faqSchema, featuresSchema } from "./common";
import { pricingDataSchema } from "./pricing";

const automationExplanationSchema = z.string();

const benefitItemSchema = z.object({
  description: z.string(),
  icon: z.string(),
  title: z.string(),
});

export const benefitsSchema = z.object({
  badge: z.string(),
  benefits: z.array(benefitItemSchema),
  subtitle: z.string(),
  title: z.string(),
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
  titleAccentRotations: z.array(z.string()).optional(),
});
export type Hero = z.infer<typeof heroSchema>;

export const howItWorksStepSchema = z.object({
  n: z.string(),
  title: z.string(),
  description: z.string(),
});

export const clipTerminalSchema = z.object({
  connected: z.string(),
  done: z.string(),
  followOk: z.string(),
  followQ: z.string(),
  prompt: z.string(),
  resultSummary: z.string(),
});
export type ClipTerminal = z.infer<typeof clipTerminalSchema>;

export const howItWorksSchema = z.object({
  eyebrow: z.string(),
  title: z.string(),
  steps: z.array(howItWorksStepSchema),
  clipTerminal: clipTerminalSchema,
});
export type HowItWorks = z.infer<typeof howItWorksSchema>;

export const walkthroughBulletSchema = z.object({
  title: z.string(),
  description: z.string(),
});

export const walkthroughSchema = z.object({
  badge: z.string(),
  title: z.string(),
  titleAccent: z.string(),
  videoSrc: z.string().optional(),
  posterSrc: z.string().optional(),
  bullets: z.array(walkthroughBulletSchema),
});
export type Walkthrough = z.infer<typeof walkthroughSchema>;

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
  howItWorks: howItWorksSchema.optional(),
  pricing: pricingDataSchema.optional(),
  pricingTitle: pricingTitleSchema.optional(),
  walkthrough: walkthroughSchema.optional(),
  rootMetadata: rootMetadataSchema,
  title: z.string(),
});
