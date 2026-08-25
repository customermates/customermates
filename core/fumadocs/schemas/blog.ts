import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

const heroSchema = z.object({
  buttonLeftHref: z.string(),
  buttonLeftText: z.string(),
  buttonRightHref: z.string(),
  buttonRightText: z.string(),
  description: z.string(),
  hint: z.string(),
  title: z.string(),
});

export const blogSchema = frontmatterSchema.extend({
  description: z.string(),
  hero: heroSchema,
  title: z.string(),
});
