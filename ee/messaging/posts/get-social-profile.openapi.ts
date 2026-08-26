import type { ZodOpenApiOperationObject } from "zod-openapi";

import { GetSocialProfileSchema } from "@/ee/messaging/posts/get-social-profile.interactor";
import { SocialProfileSchema } from "@/ee/messaging/posts/social-posts.schema";
import { CommonApiResponses } from "@/core/api/interactor-handler";

export const getSocialProfileOperation: ZodOpenApiOperationObject = {
  operationId: "getSocialProfile",
  summary: "Get a social profile",
  description:
    "Reads a LinkedIn or Instagram profile by identifier from a connected account. On LinkedIn the identifier is the public identifier or a provider member id (use 'me' for the account owner); on Instagram it is the username. Requires a connected LinkedIn or Instagram account.",
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
