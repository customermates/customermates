import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { ctaSchema, faqSchema, heroSchema } from "./common";

export const forPagesSchema = frontmatterSchema.extend({
  cta: ctaSchema,
  faq: faqSchema.optional(),
  description: z.string(),
  hero: heroSchema,
  industryName: z.string(),
  title: z.string(),
});
