import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

import { heroSchema } from "./common";

export const hubSchema = frontmatterSchema.extend({
  description: z.string(),
  hero: heroSchema,
  title: z.string(),
});
