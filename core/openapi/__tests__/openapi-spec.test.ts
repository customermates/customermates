import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import type { z } from "zod";

import { generateOpenApiSpec } from "@/core/openapi/openapi-spec";
import { GetModelSchema } from "@/features/records/configure-records.interactor";
import { ConfigurationContractSchema } from "@/features/records/configuration.schema";
import { MutateRecordSchema, RecordQuerySchema } from "@/features/records/record-query.schema";
import { recordApiExamples, recordApiPaths } from "@/features/records/records.openapi";
import { RestoreTrashSchema } from "@/features/trash/trash.schema";

type Operation = {
  requestBody?: { content?: Record<string, { schema?: { $ref?: string; properties?: Record<string, unknown> } }> };
  responses?: Record<string, { content?: unknown }>;
  description?: string;
};

const spec = generateOpenApiSpec() as { paths: Record<string, { post?: Operation }> };

function post(path: string): Operation {
  const operation = spec.paths[path]?.post;
  if (!operation) throw new Error(`Missing POST ${path}`);
  return operation;
}

describe("OpenAPI spec", () => {
  it("matches the committed public/v1/openapi.json; run yarn openapi:generate after changing the API", () => {
    const committed: unknown = JSON.parse(readFileSync(join(process.cwd(), "public", "v1", "openapi.json"), "utf8"));
    expect(committed).toEqual(JSON.parse(JSON.stringify(generateOpenApiSpec())));
  });

  it.each([
    ["query", RecordQuerySchema, recordApiExamples.query],
    ["mutate", MutateRecordSchema, recordApiExamples.mutate],
    ["discover", GetModelSchema, recordApiExamples.discover],
    ["apply", ConfigurationContractSchema, recordApiExamples.apply],
    ["restore", RestoreTrashSchema, recordApiExamples.restore],
  ] as const)("documents %s request examples the API accepts", (_, schema: z.ZodType, examples) => {
    for (const example of Object.values(examples)) expect(schema.safeParse(example.value).error).toBeUndefined();
  });

  it("documents record mutations per action", () => {
    const body = JSON.stringify(post("/v1/records/mutate").requestBody);
    for (const action of ["create", "update", "delete", "link", "unlink", "updateMany", "deleteMany"])
      expect(body).toContain(`"const":"${action}"`);
  });

  it("states the permission every record operation requires", () => {
    for (const path of Object.keys(recordApiPaths)) expect(post(path).description, path).toMatch(/\n\nRequires: \S/);
  });

  it("documents unexpected errors without a structured body", () => {
    const responses = post("/v1/records/query").responses ?? {};
    expect(responses["500"]?.content).toBeUndefined();
    expect(responses["422"]?.content).toBeDefined();
    expect(responses["429"]?.content).toBeDefined();
  });
});
