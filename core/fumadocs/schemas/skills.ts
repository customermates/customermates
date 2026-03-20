import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { SKILL_TAGS } from "../skills-tags";

export const skillsSchema = frontmatterSchema.extend({
  description: z.string(),
  sourceUrl: z.url(),
  tags: z.array(z.enum(SKILL_TAGS)).max(3).default([]),
  title: z.string(),
});
