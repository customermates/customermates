import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { acquisitionPageSchema, ctaSchema, heroSchema } from "./common";

export const forPagesSchema = frontmatterSchema.extend({
  acquisition: acquisitionPageSchema.optional(),
  cta: ctaSchema,
  description: z.string(),
  hero: heroSchema,
  industryName: z.string(),
  title: z.string(),
});
