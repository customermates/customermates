import type { ZodOpenApiOperationObject } from "zod-openapi";

import { GetSocialProfileSchema } from "@/ee/messaging/posts/get-social-profile.interactor";
import { SocialProfileSchema } from "@/ee/messaging/posts/social-posts.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getSocialProfileOperation: ZodOpenApiOperationObject = {
  operationId: "getSocialProfile",
  summary: "Get a social profile",
  description:
    "Reads a person or company profile from a connected account. For a person, keep profileType=person and pass 'me', a top-level provider profile id, a LinkedIn Classic public_identifier, or an Instagram username; specifics.member_id is not a valid identifier. For a LinkedIn company, set profileType=company and pass its company id. Company lookup is LinkedIn-only.",
  tags: ["messaging"],
  security: [{ apiKeyAuth: [] }],
  requestBody: {
    required: true,
    content: {
      "application/json": {
        schema: GetSocialProfileSchema,
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
