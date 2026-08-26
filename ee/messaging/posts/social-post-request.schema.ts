import { z } from "zod";

import { GetSocialPostSchema } from "./get-social-post.interactor";
import { createListSocialPostsContractSchema, ListSocialPostsSchema } from "./list-social-posts.interactor";

const SingleSocialPostRequestSchema = GetSocialPostSchema.extend({
  connectedAccountId: GetSocialPostSchema.shape.connectedAccountId.describe(
    "LinkedIn or Instagram connected-account ID returned by GET /v1/messaging/connected-accounts",
  ),
  postId: GetSocialPostSchema.shape.postId.describe("Provider post ID returned by this endpoint"),
})
  .strict()
  .meta({ title: "Single post" });

export const SocialPostsBodySchema = z
  .union([SingleSocialPostRequestSchema, createListSocialPostsContractSchema()])
  .describe("List an author's posts, continue that list, or fetch one returned post by id");

export const SocialPostsRuntimeBodySchema = z.union([GetSocialPostSchema, ListSocialPostsSchema.strict()]);
