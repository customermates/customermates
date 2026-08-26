import type { ZodOpenApiOperationObject } from "zod-openapi";

import { GetSocialProfileSchema } from "@/ee/messaging/posts/get-social-profile.interactor";
import { SocialProfileSchema } from "@/ee/messaging/posts/social-posts.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

const EXAMPLE_CONNECTED_ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";

export const getSocialProfileOperation: ZodOpenApiOperationObject = {
  operationId: "getSocialProfile",
  summary: "Get a social profile",
  description:
    "Reads a person or company profile through a connected account. Use [].id from GET /v1/messaging/connected-accounts as connectedAccountId. For a person, use profileType=person with 'me', items[].participants[].identifier from POST /v1/messaging/threads/search, id returned by this endpoint, data[].author.id from a social-post or comment list, author.id from a single-post response, data[].sender.id from a reaction list, a LinkedIn Classic public profile slug, or an Instagram username. Reuse this endpoint's id with profileType=person or as a social-post authorIdentifier. For a LinkedIn company, use profileType=company with data[].id from POST /v1/messaging/sales-navigator/search/companies or data[].current_positions[].company_id from POST /v1/messaging/sales-navigator/search/people. Company lookup is LinkedIn-only.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: GetSocialProfileSchema,
        examples: {
          accountOwner: {
            summary: "Connected-account owner",
            description: "Use [].id from GET /v1/messaging/connected-accounts as connectedAccountId.",
            value: {
              connectedAccountId: EXAMPLE_CONNECTED_ACCOUNT_ID,
              identifier: "me",
              profileType: "person",
            },
          },
          linkedInPerson: {
            summary: "LinkedIn person",
            description:
              "identifier may be items[].participants[].identifier from POST /v1/messaging/threads/search or a LinkedIn Classic public profile slug.",
            value: {
              connectedAccountId: EXAMPLE_CONNECTED_ACCOUNT_ID,
              identifier: "example-person",
              profileType: "person",
            },
          },
          linkedInCompany: {
            summary: "LinkedIn company",
            description:
              "Use data[].id from POST /v1/messaging/sales-navigator/search/companies or data[].current_positions[].company_id from POST /v1/messaging/sales-navigator/search/people.",
            value: {
              connectedAccountId: EXAMPLE_CONNECTED_ACCOUNT_ID,
              identifier: "1035",
              profileType: "company",
            },
          },
        },
      },
    },
  },
  responses: {
    "200": {
      description: "The requested social profile.",
      content: {
        "application/json": {
          schema: SocialProfileSchema,
        },
      },
    },
    ...CommonApiResponses,
  },
};
