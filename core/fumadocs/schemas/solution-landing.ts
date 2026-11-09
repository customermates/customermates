import { z } from "zod";

import { deskSchema } from "./homepage";

const linkSchema = z.object({
  href: z.string(),
  label: z.string(),
});

const sectionSchema = z.object({
  description: z.string().optional(),
  eyebrow: z.string(),
  title: z.string(),
});

export const solutionLandingSchema = z.object({
  beforeAfter: sectionSchema.extend({
    after: z.object({ label: z.string(), points: z.array(z.string()).length(3) }),
    before: z.object({ label: z.string(), points: z.array(z.string()).length(3) }),
  }),
  facts: z.string(),
  followUp: sectionSchema.extend({ desk: deskSchema }),
  generator: sectionSchema.extend({
    arrowLabel: z.string(),
    prompt: z.string(),
    promptLabel: z.string(),
  }),
  hero: z.object({
    description: z.string(),
    eyebrow: z.string(),
    primaryCta: linkSchema,
    secondaryCta: linkSchema,
    title: z.string(),
  }),
  plan: sectionSchema.extend({
    limits: z.string(),
    primaryCta: linkSchema,
    secondaryCta: linkSchema,
  }),
  solution: z.string().optional(),
  steps: sectionSchema.extend({
    items: z.array(z.object({ description: z.string(), title: z.string() })).length(3),
  }),
});
export type SolutionLanding = z.infer<typeof solutionLandingSchema>;
