import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { acquisitionPageSchema, ctaSchema, heroSchema } from "./common";

export const featurePagesSchema = frontmatterSchema.extend({
  acquisition: acquisitionPageSchema.optional(),
  cta: ctaSchema,
  description: z.string(),
  featureName: z.string(),
  hero: heroSchema,
  title: z.string(),
});
