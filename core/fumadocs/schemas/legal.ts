import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { seoOverrideFields } from "./common";

export const legalSchema = frontmatterSchema.extend({
  ...seoOverrideFields,
  description: z.string(),
  title: z.string(),
});
