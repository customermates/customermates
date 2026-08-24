import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { ctaSchema, heroSchema, seoOverrideFields } from "./common";

export const forPagesSchema = frontmatterSchema.extend({
  ...seoOverrideFields,
  cta: ctaSchema,
  description: z.string(),
  hero: heroSchema,
  industryName: z.string(),
  title: z.string(),
});
