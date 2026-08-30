import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { acquisitionPageSchema, ctaSchema, heroSchema, relatedHrefsSchema } from "./common";

export const forPagesSchema = frontmatterSchema.extend({
  acquisition: acquisitionPageSchema.optional(),
  cta: ctaSchema,
  description: z.string(),
  hero: heroSchema,
  industryName: z.string(),
  relatedHrefs: relatedHrefsSchema.optional(),
  title: z.string(),
});
