import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { ctaSchema, faqSchema } from "./common";
import { pricingDataSchema } from "./pricing";
import { useCasesSchema } from "./use-cases";

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
  "homepage-configure",
] as const;

export type HomepageStageTab = {
  alt: string;
  capture: (typeof HOMEPAGE_STAGE_CAPTURES)[number];
  caption: string;
  label: string;
};

const homepageLinkSchema = z.object({
  href: z.string(),
  label: z.string(),
});

const deskItemSchema = z.object({
  meta: z.string(),
  owner: z.string().optional(),
  state: z.enum(["added", "due", "overdue", "draft", "reply"]),
  title: z.string(),
});

export const deskSchema = z.object({
  agent: z.object({
    done: z.string(),
    intent: z.string(),
    name: z.string(),
  }),
  conversation: z.object({
    company: z.string(),
    label: z.string(),
    message: z.string(),
    name: z.string(),
    time: z.string(),
  }),
  draft: z.object({
    badge: z.string(),
    edit: z.string(),
    send: z.string(),
    text: z.string(),
  }),
  label: z.string(),
  today: z.object({
    addedBy: z.string(),
    assign: z.string(),
    date: z.string(),
    sections: z
      .array(
        z.object({
          items: z.array(deskItemSchema).min(1).max(3),
          title: z.string(),
        }),
      )
      .min(1)
      .max(3),
    title: z.string(),
  }),
  workspace: z.string(),
});
export type HomepageDesk = z.infer<typeof deskSchema>;

export const heroSchema = z.object({
  assurance: z.string(),
  primaryCta: homepageLinkSchema,
  secondaryCta: homepageLinkSchema,
  subtitle: z.string(),
  title: z.string(),
});
export type Hero = z.infer<typeof heroSchema>;

const howItWorksStepSchema = z.object({
  n: z.string(),
  title: z.string(),
  description: z.string(),
});

const howItWorksSchema = z.object({
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

const walkthroughBulletSchema = z.object({
  title: z.string(),
  description: z.string(),
});

const walkthroughSchema = z.object({
  badge: z.string(),
  bullets: z.array(walkthroughBulletSchema),
  alt: z.string(),
  title: z.string(),
  titleAccent: z.string(),
});
export type Walkthrough = z.infer<typeof walkthroughSchema>;

const homepageFlowSchema = z.object({
  eyebrow: z.string(),
  steps: z.array(z.object({ description: z.string(), title: z.string() })).length(3),
  title: z.string(),
});
export type HomepageFlow = z.infer<typeof homepageFlowSchema>;

const homepageStorySchema = z.object({
  capture: z.object({
    alt: z.string(),
    caption: z.string().optional(),
    title: z.string(),
  }),
  description: z.string(),
  eyebrow: z.string(),
  points: z.array(z.string()).length(3),
  title: z.string(),
});
export type HomepageStory = z.infer<typeof homepageStorySchema>;

const homepageRoutinesSchema = z.object({
  alt: z.string(),
  description: z.string(),
  eyebrow: z.string(),
  points: z.array(z.string()).length(3),
  title: z.string(),
});
export type HomepageRoutines = z.infer<typeof homepageRoutinesSchema>;

const pricingTitleSchema = z.object({
  subtitle: z.string(),
  title: z.string(),
});
const rootMetadataSchema = z.object({
  defaultDescription: z.string(),
  defaultTitle: z.string(),
});
export type HomepageRootMetadata = z.infer<typeof rootMetadataSchema>;

const homepageGeneratorSchema = z.object({
  arrowLabel: z.string(),
  steps: z
    .array(z.object({ description: z.string(), title: z.string() }))
    .length(3)
    .optional(),
  description: z.string(),
  eyebrow: z.string(),
  items: z
    .array(
      z.object({
        href: z.string(),
        label: z.string(),
        linkLabel: z.string(),
        prompt: z.string(),
        solution: z.enum(["consultants", "agencies", "smb", "freelancers", "startups", "linkedin-crm"]),
      }),
    )
    .min(2)
    .max(6),
  promptLabel: z.string(),
  title: z.string(),
});
export type HomepageGenerator = z.infer<typeof homepageGeneratorSchema>;

const homepageFollowUpSchema = z.object({
  description: z.string(),
  desk: deskSchema,
  eyebrow: z.string(),
  title: z.string(),
});
export type HomepageFollowUp = z.infer<typeof homepageFollowUpSchema>;

const pillarBaseSchema = z.object({
  description: z.string(),
  plan: z.string(),
  title: z.string(),
});

const homepagePillarsSchema = z.object({
  agents: pillarBaseSchema.extend({
    clients: z.array(z.object({ detail: z.string(), name: z.string() })).length(4),
  }),
  data: pillarBaseSchema.extend({
    lists: z.array(z.string()).min(2).max(4),
    record: z.object({
      fields: z.array(z.object({ label: z.string(), value: z.string() })).length(4),
      name: z.string(),
    }),
  }),
  description: z.string(),
  eyebrow: z.string(),
  inbox: pillarBaseSchema.extend({
    thread: z.object({
      linkedTo: z.string(),
      name: z.string(),
      preview: z.string(),
    }),
  }),
  knowledge: pillarBaseSchema.extend({
    doc: z.object({
      lines: z.array(z.string()).length(3),
      title: z.string(),
      usedBy: z.string(),
    }),
  }),
  title: z.string(),
});
export type HomepagePillars = z.infer<typeof homepagePillarsSchema>;

const homepageProofSchema = z.object({
  partners: z.object({
    cta: homepageLinkSchema,
    description: z.string(),
    eyebrow: z.string(),
    points: z.array(z.string()).length(3),
    title: z.string(),
  }),
  proof: z.object({
    description: z.string(),
    eyebrow: z.string(),
    note: z.string(),
    steps: z.array(z.string()).length(3),
    title: z.string(),
  }),
});
export type HomepageProof = z.infer<typeof homepageProofSchema>;

const homepagePlansSchema = z.object({
  compareHref: z.string(),
  compareLabel: z.string(),
  cta: z.string(),
  ctaHref: z.string(),
  description: z.string(),
  eyebrow: z.string(),
  items: z
    .array(
      z.object({
        badge: z.string().optional(),
        job: z.string(),
        name: z.string(),
        points: z.array(z.string()).length(3),
        price: z.string(),
      }),
    )
    .length(3),
  perSeat: z.string(),
  title: z.string(),
});
export type HomepagePlans = z.infer<typeof homepagePlansSchema>;

export const homepageSchema = frontmatterSchema.extend({
  automationExplanation: automationExplanationSchema,
  benefits: benefitsSchema,
  closingEyebrow: z.string(),
  cta: ctaSchema,
  description: z.string(),
  faq: faqSchema,
  flow: homepageFlowSchema,
  hero: heroSchema,
  followUp: homepageFollowUpSchema,
  generator: homepageGeneratorSchema,
  pillars: homepagePillarsSchema,
  plansTeaser: homepagePlansSchema,
  proofAndPartners: homepageProofSchema,
  howItWorks: howItWorksSchema.optional(),
  pricing: pricingDataSchema.optional(),
  pricingTitle: pricingTitleSchema.optional(),
  pipelineStory: homepageStorySchema,
  routines: homepageRoutinesSchema,
  walkthrough: walkthroughSchema.optional(),
  rootMetadata: rootMetadataSchema,
  title: z.string(),
  useCases: useCasesSchema,
});
