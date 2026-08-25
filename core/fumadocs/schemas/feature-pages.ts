import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { ctaSchema, heroSchema, relatedSchema } from "./common";

export const featurePagesSchema = frontmatterSchema.extend({
  cta: ctaSchema,
  description: z.string(),
  featureName: z.string(),
  hero: heroSchema,
  related: relatedSchema,
  title: z.string(),
});
