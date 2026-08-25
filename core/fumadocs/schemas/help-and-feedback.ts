import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { faqSchema } from "./common";

export const helpAndFeedbackSchema = frontmatterSchema.extend({
  description: z.string(),
  faq: faqSchema,
  title: z.string(),
});
