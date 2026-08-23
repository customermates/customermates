import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { ctaSchema, faqSchema, heroSchema } from "./common";

export const featurePagesSchema = frontmatterSchema.extend({
  cta: ctaSchema,
  faq: faqSchema.optional(),
  description: z.string(),
  featureName: z.string(),
  hero: heroSchema,
  title: z.string(),
});
