import { frontmatterSchema } from "fumadocs-mdx/config";
import { z } from "zod";

export const blogPostSchema = z.object({
  author: z.string(),
  backToBlog: z.string(),
  by: z.string(),
  date: z.date().or(z.string()),
  tags: z.array(z.string()),
});
export type BlogPost = z.infer<typeof blogPostSchema>;

const heroSchema = z.object({
  description: z.string(),
  title: z.string(),
});
export type Hero = z.infer<typeof heroSchema>;

export const blogPostsSchema = frontmatterSchema.extend({
  blogPost: blogPostSchema,
  description: z.string(),
  hero: heroSchema,
  title: z.string(),
});
