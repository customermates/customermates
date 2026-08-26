import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { SocialPostsBodySchema } from "@/ee/messaging/posts/social-post-request.schema";
import { SocialPostSchema, SocialPostListSchema } from "@/ee/messaging/posts/social-posts.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

const EXAMPLE_CONNECTED_ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";
const EXAMPLE_PERSON_ID = "ACoAAExampleProviderProfileId";

export const getSocialPostsOperation: ZodOpenApiOperationObject = {
  operationId: "getSocialPosts",
  summary: "List or fetch social posts",
  description:
    "Reads LinkedIn or Instagram posts through a connected account. Use authorIdentifier='me' for the account owner, or a top-level person id returned by a social profile, post or engagement response. When starting from a messaging thread participant, resolve participants[].identifier through the social-profile endpoint first. For the first page, omit cursor and offset. For a cursor continuation, repeat the same connectedAccountId, authorIdentifier and limit, pass next_cursor unchanged as cursor, and omit offset. Stop when next_cursor is null. Offset-based continuations use a positive cumulative offset. Set postId instead to fetch one returned post.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: SocialPostsBodySchema,
        examples: {
          accountOwnerFirstPage: {
            summary: "First page of the account owner's posts",
            description:
              "Replace connectedAccountId with an ok LinkedIn or Instagram account id returned by GET /v1/messaging/connected-accounts.",
            value: {
              connectedAccountId: EXAMPLE_CONNECTED_ACCOUNT_ID,
              authorIdentifier: "me",
              limit: 10,
            },
          },
          personFirstPage: {
            summary: "First page for a resolved person",
            description: "Use the top-level id returned by the social-profile endpoint as authorIdentifier.",
            value: {
              connectedAccountId: EXAMPLE_CONNECTED_ACCOUNT_ID,
              authorIdentifier: EXAMPLE_PERSON_ID,
              limit: 10,
            },
          },
          cursorContinuation: {
            summary: "Continue the same person's result",
            description:
              "Repeat connectedAccountId, authorIdentifier and limit from the previous request, and copy next_cursor into cursor.",
            value: {
              connectedAccountId: EXAMPLE_CONNECTED_ACCOUNT_ID,
              authorIdentifier: EXAMPLE_PERSON_ID,
              cursor: "AQEFAExampleNextCursor",
              limit: 10,
            },
          },
          singlePost: {
            summary: "Fetch one returned post",
            description: "Use an id returned by a post-list response as postId.",
            value: {
              connectedAccountId: EXAMPLE_CONNECTED_ACCOUNT_ID,
              postId: "urn:li:activity:example-post-id",
            },
          },
        },
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
