import type { ErrorObject, ValidateFunction } from "ajv";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

type JsonSchema = Record<string, unknown>;
type MediaType = { schema?: JsonSchema; example?: unknown };
type Operation = {
  requestBody?: { content?: Record<string, MediaType> };
  responses?: Record<string, { content?: Record<string, MediaType> }>;
};
export type OpenApiDocument = {
  paths: Record<string, Record<string, Operation>>;
  components?: Record<string, unknown>;
};

const SPEC_ID = "openapi-document";

function anchored<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value).replaceAll(
      '"#/components/',
      `"${SPEC_ID}#/components/`,
    ),
  ) as T;
}

export function createOpenApiValidator(spec: OpenApiDocument) {
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  ajv.addSchema({ $id: SPEC_ID, components: anchored(spec.components ?? {}) });
  const compiled = new Map<string, ValidateFunction>();

  function operation(path: string, method: string) {
    const found = spec.paths[path]?.[method];
    if (!found) throw new Error(`No OpenAPI operation for ${method} ${path}`);
    return found;
  }

  function validate(
    key: string,
    schema: JsonSchema | undefined,
    value: unknown,
  ): ErrorObject[] {
    if (!schema) throw new Error(`No JSON schema for ${key}`);
    let check = compiled.get(key);
    if (!check) {
      check = ajv.compile(anchored(schema));
      compiled.set(key, check);
    }
    return check(value) ? [] : [...(check.errors ?? [])];
  }

  return {
    response(
      path: string,
      method: string,
      status: number | string,
      body: unknown,
    ) {
      const media = operation(path, method).responses?.[String(status)]
        ?.content?.["application/json"];
      return validate(`${method} ${path} ${status}`, media?.schema, body);
    },
    request(path: string, method: string, body: unknown) {
      const media = operation(path, method).requestBody?.content?.[
        "application/json"
      ];
      return validate(`${method} ${path} request`, media?.schema, body);
    },
    examples(path: string, method: string) {
      const target = operation(path, method);
      return {
        request: target.requestBody?.content?.["application/json"]?.example,
        responses: Object.entries(target.responses ?? {}).flatMap(
          ([status, response]) => {
            const example = response.content?.["application/json"]?.example;
            return example === undefined ? [] : [{ status, example }];
          },
        ),
      };
    },
  };
}
