import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { acquisitionPageSchema, ctaSchema, heroSchema, relatedHrefsSchema } from "./common";
import { featureSectionsSchema } from "./landing-sections";
import { solutionLandingSchema } from "./solution-landing";

export const featurePagesSchema = frontmatterSchema.extend({
  acquisition: acquisitionPageSchema.optional(),
  cta: ctaSchema,
  description: z.string(),
  featureName: z.string(),
  hero: heroSchema,
  landing: solutionLandingSchema.optional(),
  relatedHrefs: relatedHrefsSchema.optional(),
  sections: featureSectionsSchema.optional(),
  title: z.string(),
});
