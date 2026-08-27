import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { ctaSchema, heroSchema } from "./common";

export const featurePagesSchema = frontmatterSchema.extend({
  cta: ctaSchema,
  description: z.string(),
  featureName: z.string(),
  hero: heroSchema,
  title: z.string(),
  visualSection: z
    .object({
      description: z.string(),
      labels: z.object({
        focal: z.string(),
        semantic: z.tuple([z.string(), z.string()]),
      }),
      title: z.string(),
    })
    .optional(),
});
