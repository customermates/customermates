import { describe, expect, it } from "vitest";

import { generateOpenApiSpec } from "@/core/openapi/openapi-spec";
import { createMapping, PAYLOAD } from "@/features/incoming-webhook/__tests__/incoming-webhook-fixtures";
import { createConfig } from "@/features/public-form/__tests__/public-form-fixtures";
import { createOpenApiValidator, type OpenApiDocument } from "@/tests/helpers/openapi-validator";

const spec = generateOpenApiSpec() as unknown as OpenApiDocument;
const validator = createOpenApiValidator(spec);

const OPERATIONS = [
  "/v1/forms/list",
  "/v1/forms/read",
  "/v1/forms/fields",
  "/v1/forms/save",
  "/v1/forms/disable",
  "/v1/incoming-webhooks/list",
  "/v1/incoming-webhooks/read",
  "/v1/incoming-webhooks/fields",
  "/v1/incoming-webhooks/create",
  "/v1/incoming-webhooks/update",
  "/v1/incoming-webhooks/delete",
  "/v1/incoming-webhooks/test",
  "/v1/incoming-webhooks/deliveries",
] as const;

describe("form and incoming webhook REST OpenAPI operations", () => {
  it.each(OPERATIONS)("documents %s with API-key auth, a permission and structured errors", (path) => {
    const operation = spec.paths[path]?.post as unknown as {
      security?: unknown;
      description?: string;
      responses: Record<string, { content?: Record<string, { schema?: { $ref?: string } }> }>;
    };

    expect(operation.security).toEqual([{ apiKeyAuth: [] }]);
    expect(operation.description).toMatch(/Requires: [^.]+\.$/);
    for (const status of ["400", "401", "403", "404"]) {
      expect(operation.responses[status]?.content?.["application/json"]?.schema?.$ref).toBe(
        "#/components/schemas/StructuredErrorResponseSchema",
      );
    }
  });

  it.each(OPERATIONS)("ships a request example for %s that satisfies its own schema", (path) => {
    const { request } = validator.examples(path, "post");

    expect(request).toBeDefined();
    expect(validator.request(path, "post", request)).toEqual([]);
  });

  it("accepts the real form result in the form responses", () => {
    const form = {
      id: "4f3e2d1c-0b9a-4876-9543-210fedcba987",
      typeId: "0b8c7d6e-5f4a-4b3c-9d2e-1f0a9b8c7d6e",
      name: "Contact form",
      enabled: true,
      url: "https://app.example.com/f/token",
      embedSnippet: '<iframe src="https://app.example.com/f/token?embed=1"></iframe>',
      config: createConfig(),
      consentVersion: 1,
      submissionCount: 3,
      lastSubmittedAt: null,
      createdAt: "2026-11-13T10:00:00.000Z",
      updatedAt: "2026-11-13T10:00:00.000Z",
      usage: { submissionsThisMonth: 3, monthlyLimit: 50, badge: true },
    };

    expect(validator.response("/v1/forms/read", "post", 200, form)).toEqual([]);
    expect(validator.response("/v1/forms/list", "post", 200, { items: [form] })).toEqual([]);
    expect(validator.response("/v1/forms/save", "post", 200, form)).toEqual([]);
    expect(validator.response("/v1/forms/read", "post", 200, { ...form, unknown: 1 })).not.toEqual([]);
  });

  it("accepts the real incoming webhook results and never has a signing secret in them", () => {
    const webhook = {
      id: "4f3e2d1c-0b9a-4876-9543-210fedcba987",
      typeId: "0b8c7d6e-5f4a-4b3c-9d2e-1f0a9b8c7d6e",
      name: "Website signups",
      enabled: true,
      url: "https://app.example.com/api/hooks/token",
      hasSigningSecret: true,
      signatureHeader: "x-signature",
      mapping: createMapping(),
      samplePayload: PAYLOAD,
      lastReceivedAt: null,
      createdAt: "2026-11-13T10:00:00.000Z",
      updatedAt: "2026-11-13T10:00:00.000Z",
    };

    expect(validator.response("/v1/incoming-webhooks/read", "post", 200, { webhook })).toEqual([]);
    expect(validator.response("/v1/incoming-webhooks/list", "post", 200, { items: [webhook] })).toEqual([]);
    expect(validator.response("/v1/incoming-webhooks/delete", "post", 200, { deleted: true })).toEqual([]);
    expect(
      validator.response("/v1/incoming-webhooks/read", "post", 200, { webhook: { ...webhook, signingSecret: "s" } }),
    ).not.toEqual([]);
  });
});
