import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

export const blogSchema = frontmatterSchema.extend({
  description: z.string(),
  title: z.string(),
});
