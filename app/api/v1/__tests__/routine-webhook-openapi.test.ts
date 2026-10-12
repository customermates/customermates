import { describe, expect, it } from "vitest";

import { generateOpenApiSpec } from "@/core/openapi/openapi-spec";
import { createOpenApiValidator, type OpenApiDocument } from "@/tests/helpers/openapi-validator";

const spec = generateOpenApiSpec() as unknown as OpenApiDocument;
const validator = createOpenApiValidator(spec);

const OPERATIONS = [
  ["/v1/routines/list", "post"],
  ["/v1/routines/read", "post"],
  ["/v1/routines/runs", "post"],
  ["/v1/routines/create", "post"],
  ["/v1/routines/update", "post"],
  ["/v1/routines/pause", "post"],
  ["/v1/routines/resume", "post"],
  ["/v1/routines/run", "post"],
  ["/v1/routines/delete", "post"],
  ["/v1/webhooks", "get"],
  ["/v1/webhooks/{id}", "patch"],
  ["/v1/webhooks/{id}/deliveries", "get"],
  ["/v1/webhooks/{id}/deliveries/{deliveryId}/resend", "post"],
] as const;

describe("routine and webhook REST OpenAPI operations", () => {
  it.each(OPERATIONS)("documents %s %s with API-key auth, a permission and structured errors", (path, method) => {
    const operation = spec.paths[path]?.[method] as unknown as {
      security?: unknown;
      description?: string;
      responses: Record<string, { content?: Record<string, { schema?: { $ref?: string } }> }>;
    };

    expect(operation.security).toEqual([{ apiKeyAuth: [] }]);
    expect(operation.description).toMatch(/Requires: [^.]+\.$/);
    for (const status of ["400", "401", "403", "404", "409"]) {
      expect(operation.responses[status]?.content?.["application/json"]?.schema?.$ref).toBe(
        "#/components/schemas/StructuredErrorResponseSchema",
      );
    }
  });

  it.each(OPERATIONS)("ships examples for %s %s that satisfy their own schemas", (path, method) => {
    const { request, responses } = validator.examples(path, method);

    if (method !== "get") expect(validator.request(path, method, request)).toEqual([]);
    expect(responses).toHaveLength(1);
    for (const { status, example } of responses) expect(validator.response(path, method, status, example)).toEqual([]);
  });
});
