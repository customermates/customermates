import { describe, expect, it } from "vitest";

import { GetQueryParamsSchema } from "@/core/base/base-get.schema";
import { generateOpenApiSpec } from "@/core/openapi/openapi-spec";
import { createOpenApiValidator, type OpenApiDocument } from "@/tests/helpers/openapi-validator";

const spec = generateOpenApiSpec() as unknown as OpenApiDocument;
const validator = createOpenApiValidator(spec);

type Operation = {
  security?: unknown;
  description?: string;
  requestBody?: { content?: Record<string, { examples?: Record<string, { value: unknown }> }> };
  responses: Record<string, { content?: Record<string, { schema?: { $ref?: string } }> }>;
};

const OPERATIONS = [
  ["/v1/messaging/threads/{id}/state", "post", "Inbox messages Edit"],
  ["/v1/messaging/threads/{id}/move", "post", "Inbox messages Edit"],
  ["/v1/messaging/connected-accounts/connect-link", "post", "Inbox messages Create"],
  ["/v1/webhooks/deliveries", "get", "read all permission on the API"],
  ["/v1/roles/list", "post", "read access to users"],
] as const;

function operation(path: string, method: string) {
  return spec.paths[path]?.[method] as unknown as Operation;
}

describe("inbox triage, connect link, role list and workspace delivery OpenAPI operations", () => {
  it.each(OPERATIONS)(
    "documents %s %s with API-key auth, its permission and structured errors",
    (path, method, permission) => {
      const documented = operation(path, method);

      expect(documented.security).toEqual([{ apiKeyAuth: [] }]);
      expect(documented.description).toContain(`Requires: ${permission}`);
      for (const status of ["400", "401", "403", "404", "409"]) {
        expect(documented.responses[status]?.content?.["application/json"]?.schema?.$ref).toBe(
          "#/components/schemas/StructuredErrorResponseSchema",
        );
      }
    },
  );

  it.each(OPERATIONS.filter(([path]) => path !== "/v1/roles/list"))(
    "ships examples for %s %s that satisfy their own schemas",
    (path, method) => {
      const { request, responses } = validator.examples(path, method);

      if (method !== "get") expect(validator.request(path, method, request)).toEqual([]);
      expect(responses).toHaveLength(1);
      for (const { status, example } of responses)
        expect(validator.response(path, method, status, example)).toEqual([]);
    },
  );

  it("documents a role list example the roles interactor accepts", () => {
    const example = operation("/v1/roles/list", "post").requestBody?.content?.["application/json"]?.examples?.default
      ?.value;

    expect(validator.request("/v1/roles/list", "post", example)).toEqual([]);
    expect(GetQueryParamsSchema.safeParse(example).success).toBe(true);
  });

  it("documents only the state of a conversation, never sharing it", () => {
    expect(validator.request("/v1/messaging/threads/{id}/state", "post", { state: "open" })).toEqual([]);
    expect(
      validator.request("/v1/messaging/threads/{id}/state", "post", { state: "open", sharedToCrm: true }),
    ).not.toEqual([]);
  });

  it("documents the workspace deliveries as their own path beside a webhook's deliveries", () => {
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining(["/v1/webhooks/deliveries", "/v1/webhooks/{id}", "/v1/webhooks/{id}/deliveries"]),
    );
    expect(spec.paths["/v1/webhooks/deliveries"]).not.toHaveProperty("patch");
    expect(spec.paths["/v1/webhooks/deliveries"]).not.toHaveProperty("delete");
  });
});
