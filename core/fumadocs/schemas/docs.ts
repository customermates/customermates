import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

export const docsSchema = frontmatterSchema.extend({
  description: z.string(),
  title: z.string(),
});
