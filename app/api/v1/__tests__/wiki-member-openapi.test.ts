import { describe, expect, it } from "vitest";

import { generateOpenApiSpec } from "@/core/openapi/openapi-spec";

type Operation = {
  description?: string;
  security?: unknown[];
  requestBody?: { required?: boolean; content?: Record<string, { examples?: Record<string, { value: unknown }> }> };
  responses?: Record<string, unknown>;
};

const OPERATIONS = [
  ["/v1/wiki/list", "post", "Knowledge Base read access"],
  ["/v1/wiki/search", "post", "Knowledge Base read access"],
  ["/v1/wiki/read", "post", "Knowledge Base read access"],
  ["/v1/wiki/create", "post", "Knowledge Base Create"],
  ["/v1/wiki/update", "post", "Knowledge Base Edit"],
  ["/v1/wiki/move", "post", "Knowledge Base Edit"],
  ["/v1/wiki/delete", "post", "Knowledge Base Delete"],
  ["/v1/members/invite", "post", "Users & Roles Create"],
  ["/v1/members/update", "post", "Users & Roles Edit"],
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
      const statuses = Object.keys(operation.responses ?? {});
      expect(statuses).toEqual(expect.arrayContaining(["200", "400", "401", "403", "409", "500"]));
      if (path === "/v1/users/me") expect(statuses).not.toContain("404");
      else expect(statuses).toContain("404");
      expect(JSON.stringify(operation.responses?.["403"])).toContain("StructuredErrorResponseSchema");
    },
  );

  it("documents the profile read with the same structured failures as the profile update", () => {
    expect(JSON.stringify(spec.paths["/v1/users/me"].get.responses?.["401"])).toContain(
      "StructuredErrorResponseSchema",
    );
  });
});
