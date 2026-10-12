import { describe, expect, it } from "vitest";

import { generateOpenApiSpec } from "@/core/openapi/openapi-spec";

type Operation = {
  description?: string;
  security?: unknown[];
  requestBody?: { required?: boolean; content?: Record<string, { examples?: Record<string, { value: unknown }> }> };
  responses?: Record<string, unknown>;
};

const OPERATIONS = [
  ["/v1/wiki/list", "post", "Knowledge Base Read"],
  ["/v1/wiki/search", "post", "Knowledge Base Read"],
  ["/v1/wiki/read", "post", "Knowledge Base Read"],
  ["/v1/wiki/create", "post", "Knowledge Base Manage"],
  ["/v1/wiki/update", "post", "Knowledge Base Manage"],
  ["/v1/wiki/move", "post", "Knowledge Base Manage"],
  ["/v1/wiki/delete", "post", "Knowledge Base Manage"],
  ["/v1/members/invite", "post", "Users & Roles Manage (create)"],
  ["/v1/members/update", "post", "Users & Roles Manage (update)"],
  ["/v1/users/me", "patch", "an active workspace membership"],
] as const;

describe("Knowledge Base, member and profile OpenAPI operations", () => {
  const spec = generateOpenApiSpec() as unknown as { paths: Record<string, Record<string, Operation>> };

  it.each(OPERATIONS)(
    "%s %s documents its permission, API key, example and structured failures",
    (path, verb, permission) => {
      const operation = spec.paths[path]?.[verb];

      expect(operation, `${verb} ${path}`).toBeDefined();
      expect(operation.description).toContain(`Requires: ${permission}`);
      expect(operation.security).toEqual([{ apiKeyAuth: [] }]);
      expect(operation.requestBody?.required).toBe(true);
      expect(operation.requestBody?.content?.["application/json"]?.examples?.default?.value).toBeDefined();
      expect(Object.keys(operation.responses ?? {})).toEqual(["200", "400", "401", "403", "404", "409", "500"]);
      expect(JSON.stringify(operation.responses?.["403"])).toContain("StructuredErrorResponseSchema");
    },
  );

  it("documents the profile read with the same structured failures as the profile update", () => {
    expect(JSON.stringify(spec.paths["/v1/users/me"].get.responses?.["401"])).toContain(
      "StructuredErrorResponseSchema",
    );
  });
});
