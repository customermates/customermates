import type { ZodOpenApiOperationObject } from "zod-openapi";

import { z } from "zod";

import { GetSocialPostSchema } from "@/ee/messaging/posts/get-social-post.interactor";
import { ListSocialPostsSchema } from "@/ee/messaging/posts/list-social-posts.interactor";
import { SocialPostSchema, SocialPostListSchema } from "@/ee/messaging/posts/social-posts.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

const EXAMPLE_CONNECTED_ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";
const EXAMPLE_PERSON_ID = "ACoAAExampleProviderProfileId";
const SocialPostsBodySchema = z
  .union([GetSocialPostSchema.meta({ title: "Single post" }), ListSocialPostsSchema])
  .describe("List an author's posts, continue that list, or fetch one returned post by ID");

export const getSocialPostsOperation: ZodOpenApiOperationObject = {
  operationId: "getSocialPosts",
  summary: "List or fetch social posts",
  description:
    "Reads LinkedIn or Instagram posts through a connected account. Use [].id from GET /v1/messaging/connected-accounts as connectedAccountId. Use authorIdentifier='me' for the account owner, id from POST /v1/messaging/social-profiles/search, data[].author.id from a post-list response, or author.id from a single-post response. A messaging participant can first be resolved from items[].participants[].identifier returned by POST /v1/messaging/threads/search. For the first page, omit cursor and offset. For a cursor continuation, repeat connectedAccountId, authorIdentifier and limit, copy next_cursor from the previous response into cursor, and omit offset. Stop when next_cursor is null. An offset continuation requires a positive cumulative offset. Set postId instead to data[].id from a previous post-list response to fetch that post.",
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
            description: "Use [].id from GET /v1/messaging/connected-accounts as connectedAccountId.",
            value: {
              connectedAccountId: EXAMPLE_CONNECTED_ACCOUNT_ID,
              authorIdentifier: "me",
              limit: 10,
            },
          },
          personFirstPage: {
            summary: "First page for a resolved person",
            description: "Use id returned by POST /v1/messaging/social-profiles/search as authorIdentifier.",
            value: {
              connectedAccountId: EXAMPLE_CONNECTED_ACCOUNT_ID,
              authorIdentifier: EXAMPLE_PERSON_ID,
              limit: 10,
            },
          },
          cursorContinuation: {
            summary: "Continue the same person's result",
            description:
              "Repeat connectedAccountId, authorIdentifier and limit from the previous request, and copy the previous response's next_cursor into cursor.",
            value: {
              connectedAccountId: EXAMPLE_CONNECTED_ACCOUNT_ID,
              authorIdentifier: EXAMPLE_PERSON_ID,
              cursor: "AQEFAExampleNextCursor",
              limit: 10,
            },
          },
          offsetContinuation: {
            summary: "Continue with a cumulative offset",
            description:
              "Repeat connectedAccountId, authorIdentifier and limit from the previous request, and set offset to the number of posts already returned.",
            value: {
              connectedAccountId: EXAMPLE_CONNECTED_ACCOUNT_ID,
              authorIdentifier: EXAMPLE_PERSON_ID,
              offset: 10,
              limit: 10,
            },
          },
          singlePost: {
            summary: "Fetch one returned post",
            description: "Use data[].id from a previous post-list response as postId.",
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
