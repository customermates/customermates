import { z } from "zod";

import { useCasesSchema } from "./use-cases";

export const LANDING_CAPTURES = [
  "homepage-configure",
  "homepage-dashboard",
  "homepage-draft",
  "homepage-inbox",
  "homepage-pipeline",
  "homepage-pipeline-board",
  "homepage-record",
  "homepage-routines",
  "homepage-thread-linkedin",
] as const;
export type LandingCapture = (typeof LANDING_CAPTURES)[number];

export const LANDING_STAGE_SOLUTIONS = [
  "agencies",
  "client-management",
  "consultants",
  "freelancers",
  "linkedin-crm",
  "sales-pipeline",
  "smb",
  "startups",
  "whatsapp-crm",
] as const;

const landingStepSchema = z.strictObject({
  description: z.string(),
  title: z.string(),
});

export const landingVisualSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("stage"),
    prompt: z.string().optional(),
    solution: z.enum(LANDING_STAGE_SOLUTIONS),
  }),
  z.strictObject({ kind: z.literal("followUp") }),
  z.strictObject({ kind: z.literal("os") }),
  z.strictObject({ kind: z.literal("film") }),
  z.strictObject({
    alt: z.string().optional(),
    caption: z.string().optional(),
    capture: z.enum(LANDING_CAPTURES),
    kind: z.literal("capture"),
  }),
]);
export type LandingVisual = z.infer<typeof landingVisualSchema>;

export const landingStepsSchema = z.strictObject({
  description: z.string().optional(),
  eyebrow: z.string().optional(),
  items: z.array(landingStepSchema).min(3).max(6),
  title: z.string().optional(),
});
export type LandingSteps = z.infer<typeof landingStepsSchema>;

export const landingHighlightsSchema = z.strictObject({
  alt: z.string().optional(),
  capture: z.enum(LANDING_CAPTURES),
  description: z.string().optional(),
  eyebrow: z.string().optional(),
  items: z.array(landingStepSchema).min(3).max(4),
  title: z.string(),
});
export type LandingHighlights = z.infer<typeof landingHighlightsSchema>;

export const featureSectionsSchema = z.strictObject({
  highlights: landingHighlightsSchema.optional(),
  steps: landingStepsSchema.optional(),
  useCases: useCasesSchema.optional(),
  visual: landingVisualSchema,
});
export type FeatureSections = z.infer<typeof featureSectionsSchema>;

export const compareSectionsSchema = z.strictObject({
  reasons: z.array(landingStepSchema).length(3),
  switchSteps: z.boolean(),
  useCases: useCasesSchema.optional(),
});
export type CompareSections = z.infer<typeof compareSectionsSchema>;
