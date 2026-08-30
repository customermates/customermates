import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { ctaSchema, heroSchema } from "./common";

export const hubSchema = frontmatterSchema.extend({
  cta: ctaSchema,
  description: z.string(),
  hero: heroSchema,
  title: z.string(),
});
