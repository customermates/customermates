import { loader } from "fumadocs-core/source";
import { toFumadocsSource } from "fumadocs-mdx/runtime/server";

import { COLLECTION_LOADERS } from "../collections";

import { blogPosts } from "@/.source/bodies/blogPosts";

export const blogPostsBodySource = loader({
  ...COLLECTION_LOADERS.blogPosts,
  source: toFumadocsSource(blogPosts, []),
});
