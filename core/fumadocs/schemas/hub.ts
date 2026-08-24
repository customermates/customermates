import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { heroSchema, seoOverrideFields } from "./common";

export const hubSchema = frontmatterSchema.extend({
  ...seoOverrideFields,
  description: z.string(),
  hero: heroSchema,
  title: z.string(),
});
