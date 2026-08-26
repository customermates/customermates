import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { ListSocialPostCommentsSchema } from "@/ee/messaging/posts/list-social-post-comments.interactor";
import { SocialCommentListSchema, SocialReactionListSchema } from "@/ee/messaging/posts/social-posts.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

const SocialPostEngagementBodySchema = ListSocialPostCommentsSchema.extend({
  kind: z
    .enum(["reactions", "comments"])
    .default("comments")
    .describe(
      "comments (default) lists the post's comments; reactions lists who reacted to the post. Ignored when commentId is set",
    ),
  commentId: z.string().optional().describe("If set, list reactions on this comment instead of the post's comments"),
});

export const getSocialPostEngagementOperation: ZodOpenApiOperationObject = {
  operationId: "getSocialPostEngagement",
  summary: "List post comments or reactions",
  description:
    "Reads engagement on a social post: kind=comments (default) lists the post's comments, kind=reactions lists who reacted to the post, or set commentId to list reactions on that specific comment (kind is ignored). Requires a connected LinkedIn or Instagram account.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
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
