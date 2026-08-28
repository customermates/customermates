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

const benefitGroupSchema = z.object({
  description: z.string(),
  title: z.string(),
});

const homepageMetricSchema = z.object({
  figure: z.string(),
  label: z.string(),
});

export const benefitsSchema = z.object({
  badge: z.string(),
  benefits: z.array(benefitItemSchema),
  groups: z.array(benefitGroupSchema).length(6),
  metrics: z.array(homepageMetricSchema).length(5),
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
  handoff: z.object({
    description: z.string(),
    eyebrow: z.string(),
    title: z.string(),
  }),
  title: z.string(),
  steps: z.array(howItWorksStepSchema),
});

export const walkthroughBulletSchema = z.object({
  title: z.string(),
  description: z.string(),
});

export const walkthroughSchema = z.object({
  badge: z.string(),
  title: z.string(),
  titleAccent: z.string(),
  videoSrc: z.string().optional(),
  visualLabel: z.string(),
  bullets: z.array(walkthroughBulletSchema),
});
export type Walkthrough = z.infer<typeof walkthroughSchema>;

export const homepageStorySchema = z.object({
  description: z.string(),
  eyebrow: z.string(),
  points: z.array(z.string()).length(3),
  title: z.string(),
});
export type HomepageStory = z.infer<typeof homepageStorySchema>;

export const homepageProductProofSchema = z.object({
  demoDescription: z.string(),
  demoEyebrow: z.string(),
  demoTitle: z.string(),
  videoDescription: z.string(),
  videoHeading: z.string(),
  videoLabel: z.string(),
  videoSrc: z.string(),
  videoTitle: z.string(),
});
export type HomepageProductProof = z.infer<typeof homepageProductProofSchema>;

export const homepageVisualLabelsSchema = z.object({
  agentActivity: z.string(),
  connectedRecord: z.string(),
  customerRecord: z.string(),
  dealValue: z.string(),
  draft: z.string(),
  humanDecision: z.string(),
  latestActivity: z.string(),
  lost: z.string(),
  open: z.string(),
  pipeline: z.string(),
  readyForReview: z.string(),
  recipient: z.string(),
  reviewAndSend: z.string(),
  weightedValue: z.string(),
  won: z.string(),
});
export type HomepageVisualLabels = z.infer<typeof homepageVisualLabelsSchema>;

export const pricingTitleSchema = z.object({
  subtitle: z.string(),
  title: z.string(),
});
export type PricingTitle = z.infer<typeof pricingTitleSchema>;

const rootMetadataSchema = z.object({
  defaultDescription: z.string(),
  defaultTitle: z.string(),
});
export type HomepageRootMetadata = z.infer<typeof rootMetadataSchema>;

export const homepageSchema = frontmatterSchema.extend({
  automationExplanation: automationExplanationSchema,
  benefits: benefitsSchema,
  closingEyebrow: z.string(),
  cta: ctaSchema,
  description: z.string(),
  faq: faqSchema,
  features: featuresSchema,
  hero: heroSchema,
  howItWorks: howItWorksSchema.optional(),
  pricing: pricingDataSchema.optional(),
  pricingTitle: pricingTitleSchema.optional(),
  productProof: homepageProductProofSchema,
  pipelineStory: homepageStorySchema,
  walkthrough: walkthroughSchema.optional(),
  rootMetadata: rootMetadataSchema,
  title: z.string(),
  visualLabels: homepageVisualLabelsSchema,
});
