import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { ListSocialPostsSchema } from "@/ee/messaging/posts/list-social-posts.interactor";
import { SocialPostSchema, SocialPostListSchema } from "@/ee/messaging/posts/social-posts.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

const SocialPostsBodySchema = ListSocialPostsSchema.extend({
  postId: z.string().optional().describe("If set, fetch this single post instead of listing an author's posts"),
});

export const getSocialPostsOperation: ZodOpenApiOperationObject = {
  operationId: "getSocialPosts",
  summary: "List or fetch social posts",
  description:
    "Reads LinkedIn or Instagram posts from a connected account. Omit postId to list an author's posts (authorIdentifier defaults to the account holder); set postId to fetch one post. Requires a connected LinkedIn or Instagram account.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: SocialPostsBodySchema,
      },
    },
  },
  responses: {
    "200": {
      description: "A page of posts, or a single post when postId is set.",
      content: {
        "application/json": {
          schema: z.union([SocialPostListSchema, SocialPostSchema]),
        },
      },
    },
    ...CommonApiResponses,
  },
};
