import type { ZodOpenApiOperationObject } from "zod-openapi";

import { GetSocialProfileSchema } from "@/ee/messaging/posts/get-social-profile.interactor";
import { SocialProfileSchema } from "@/ee/messaging/posts/social-posts.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

const EXAMPLE_CONNECTED_ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";

export const getSocialProfileOperation: ZodOpenApiOperationObject = {
  operationId: "getSocialProfile",
  summary: "Get a social profile",
  description:
    "Reads a person or company profile through a connected account. For a person, use profileType=person with 'me', participants[].identifier from a messaging-thread response, a top-level person id returned by a social response, a LinkedIn Classic public profile slug, or an Instagram username. Reuse the returned top-level id with profileType=person or as a social-post authorIdentifier. For a LinkedIn company, use profileType=company with an id returned by Sales Navigator company search or current_positions[].company_id, and reuse the returned id with profileType=company. Company lookup is LinkedIn-only.",
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
            description:
              "Replace connectedAccountId with an ok LinkedIn or Instagram account id returned by GET /v1/messaging/connected-accounts.",
            value: {
              connectedAccountId: EXAMPLE_CONNECTED_ACCOUNT_ID,
              identifier: "me",
              profileType: "person",
            },
          },
          linkedInPerson: {
            summary: "LinkedIn person",
            description:
              "identifier may be participants[].identifier from a messaging-thread response or a LinkedIn Classic public profile slug.",
            value: {
              connectedAccountId: EXAMPLE_CONNECTED_ACCOUNT_ID,
              identifier: "example-person",
              profileType: "person",
            },
          },
          linkedInCompany: {
            summary: "LinkedIn company",
            description:
              "Use a company id returned by Sales Navigator company search or current_positions[].company_id.",
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
