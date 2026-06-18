import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

export const docsSchema = frontmatterSchema.extend({
  demo: z
    .object({
      src: z.url(),
      title: z.string(),
    })
    .optional(),
  description: z.string(),
  title: z.string(),
});
