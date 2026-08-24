import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { faqSchema, seoOverrideFields } from "./common";

export const helpAndFeedbackSchema = frontmatterSchema.extend({
  ...seoOverrideFields,
  description: z.string(),
  faq: faqSchema,
  title: z.string(),
});
