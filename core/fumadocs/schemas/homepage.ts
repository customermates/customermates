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

export const HOMEPAGE_STAGE_CAPTURES = [
  "homepage-inbox",
  "homepage-record",
  "homepage-pipeline",
  "homepage-dashboard",
  "homepage-routines",
] as const;

const homepageStageTabSchema = z.object({
  alt: z.string(),
  capture: z.enum(HOMEPAGE_STAGE_CAPTURES),
  caption: z.string(),
  label: z.string(),
});
export type HomepageStageTab = z.infer<typeof homepageStageTabSchema>;

export const heroSchema = z.object({
  buttonLeftHref: z.string(),
  buttonLeftText: z.string(),
  buttonRightHref: z.string(),
  buttonRightText: z.string(),
  stage: z.object({
    disclosure: z.string(),
    label: z.string(),
    live: z.object({
      prompt: z.string(),
      status: z.string(),
    }),
    tabs: z.array(homepageStageTabSchema).length(HOMEPAGE_STAGE_CAPTURES.length),
  }),
  startFree: z.string(),
  subtitle: z.string(),
  title: z.string(),
  titleAccent: z.string(),
  useCase: z.string(),
});
export type Hero = z.infer<typeof heroSchema>;

export const howItWorksStepSchema = z.object({
  n: z.string(),
  title: z.string(),
  description: z.string(),
});

export const howItWorksSchema = z.object({
  eyebrow: z.string(),
  handoff: z.object({
    alt: z.string(),
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
  bullets: z.array(walkthroughBulletSchema),
  desktopAlt: z.string(),
  phoneAlt: z.string(),
  title: z.string(),
  titleAccent: z.string(),
});
export type Walkthrough = z.infer<typeof walkthroughSchema>;

export const homepageFlowSchema = z.object({
  eyebrow: z.string(),
  steps: z.array(z.object({ description: z.string(), title: z.string() })).length(3),
  title: z.string(),
});
export type HomepageFlow = z.infer<typeof homepageFlowSchema>;

export const homepageStorySchema = z.object({
  captures: z
    .array(
      z.object({
        alt: z.string(),
        capture: z.enum(["homepage-pipeline", "homepage-dashboard"]),
        caption: z.string(),
        title: z.string(),
      }),
    )
    .length(2),
  description: z.string(),
  disclosure: z.string(),
  eyebrow: z.string(),
  points: z.array(z.string()).length(3),
  title: z.string(),
});
export type HomepageStory = z.infer<typeof homepageStorySchema>;

export const homepageRoutinesSchema = z.object({
  alt: z.string(),
  description: z.string(),
  eyebrow: z.string(),
  points: z.array(z.string()).length(3),
  title: z.string(),
});
export type HomepageRoutines = z.infer<typeof homepageRoutinesSchema>;

export const homepageProductProofSchema = z.object({
  videoDescription: z.string(),
  videoHeading: z.string(),
  videoLabel: z.string(),
  videoSrc: z.string(),
  videoTitle: z.string(),
});
export type HomepageProductProof = z.infer<typeof homepageProductProofSchema>;

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
  flow: homepageFlowSchema,
  hero: heroSchema,
  howItWorks: howItWorksSchema.optional(),
  pricing: pricingDataSchema.optional(),
  pricingTitle: pricingTitleSchema.optional(),
  productProof: homepageProductProofSchema,
  pipelineStory: homepageStorySchema,
  routines: homepageRoutinesSchema,
  walkthrough: walkthroughSchema.optional(),
  rootMetadata: rootMetadataSchema,
  title: z.string(),
});
