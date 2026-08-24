import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { ctaSchema, heroSchema, seoOverrideFields } from "./common";

export const featurePagesSchema = frontmatterSchema.extend({
  ...seoOverrideFields,
  cta: ctaSchema,
  description: z.string(),
  featureName: z.string(),
  hero: heroSchema,
  title: z.string(),
});
