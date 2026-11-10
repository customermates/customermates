import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { acquisitionPageSchema, ctaSchema, heroSchema, relatedHrefsSchema } from "./common";
import { solutionLandingSchema } from "./solution-landing";
import { useCasesSchema } from "./use-cases";

export const forPagesSchema = frontmatterSchema.extend({
  acquisition: acquisitionPageSchema.optional(),
  cta: ctaSchema,
  description: z.string(),
  hero: heroSchema,
  industryName: z.string(),
  landing: solutionLandingSchema.optional(),
  relatedHrefs: relatedHrefsSchema.optional(),
  title: z.string(),
  useCases: useCasesSchema.optional(),
});
