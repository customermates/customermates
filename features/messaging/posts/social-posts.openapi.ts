import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { ListSocialPostsSchema } from "@/ee/messaging/posts/list-social-posts.interactor";
import { ListSocialPostCommentsSchema } from "@/ee/messaging/posts/list-social-post-comments.interactor";
import {
  SocialPostSchema,
  SocialPostListSchema,
  SocialCommentListSchema,
  SocialReactionListSchema,
} from "@/ee/messaging/posts/social-posts.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

const SocialPostsBodySchema = ListSocialPostsSchema.extend({
  postId: z.string().optional().describe("If set, fetch this single post instead of listing an author's posts"),
});

const SocialPostEngagementBodySchema = ListSocialPostCommentsSchema.extend({
  kind: z
    .enum(["reactions", "comments"])
    .default("comments")
    .describe(
      "comments (default) lists the post's comments; reactions lists who reacted to the post. Ignored when commentId is set",
    ),
  commentId: z.string().optional().describe("If set, list reactions on this comment instead of the post's comments"),
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

export const getSocialPostEngagementOperation: ZodOpenApiOperationObject = {
  operationId: "getSocialPostEngagement",
  summary: "List post comments or reactions",
  description:
    "Reads engagement on a social post: kind=comments (default) lists the post's comments, kind=reactions lists who reacted to the post, or set commentId to list reactions on that specific comment (kind is ignored). Requires a connected LinkedIn or Instagram account.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    content: {
      "application/json": {
        schema: SocialPostEngagementBodySchema,
      },
    },
  },
  responses: {
    "200": {
      description: "A page of comments, or reactions when commentId is set.",
      content: {
        "application/json": {
          schema: z.union([SocialCommentListSchema, SocialReactionListSchema]),
        },
      },
    },
    ...CommonApiResponses,
  },
};
