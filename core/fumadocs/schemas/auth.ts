import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

export const authSchema = frontmatterSchema.extend({
  description: z.string(),
  title: z.string(),
});
