import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { ctaSchema, heroSchema, relatedSchema } from "./common";

export const forPagesSchema = frontmatterSchema.extend({
  cta: ctaSchema,
  description: z.string(),
  hero: heroSchema,
  industryName: z.string(),
  related: relatedSchema,
  title: z.string(),
});
