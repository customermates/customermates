import type { z } from "zod";
import type { ZodOpenApiOperationObject } from "zod-openapi";

import { StructuredApiResponses } from "@/core/api/structured-interactor-handler";

type StructuredOperation = {
  operationId: string;
  summary: string;
  description: string;
  requires: string;
  tag: string;
  input: z.ZodType;
  output: z.ZodType;
  outputDescription: string;
  example?: unknown;
  examples?: Record<string, { summary: string; value: unknown }>;
};

export function structuredOperation(operation: StructuredOperation): ZodOpenApiOperationObject {
  return {
    operationId: operation.operationId,
    summary: operation.summary,
    description: `${operation.description}\n\nRequires: ${operation.requires}`,
    tags: [operation.tag],
    security: [{ apiKeyAuth: [] }],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: operation.input,
          ...(operation.examples ? { examples: operation.examples } : { example: operation.example }),
        },
      },
    },
    responses: {
      "200": {
        description: operation.outputDescription,
        content: { "application/json": { schema: operation.output } },
      },
      ...StructuredApiResponses,
    },
  };
}
