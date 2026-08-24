import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { seoOverrideFields } from "./common";

export const docsSchema = frontmatterSchema.extend({
  ...seoOverrideFields,
  demo: z
    .object({
      src: z.url(),
      title: z.string(),
    })
    .optional(),
  description: z.string(),
  title: z.string(),
});
