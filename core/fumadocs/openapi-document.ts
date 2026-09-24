import type { Document } from "fumadocs-openapi";

import { createOpenAPI } from "fumadocs-openapi/server";

import { env } from "@/env";
import { generateOpenApiSpec } from "@/core/openapi/openapi-spec";

export const OPENAPI_DOCUMENT_ID = "/v1/openapi.json";

export function docsOpenApiDocument(): Document {
  const spec = generateOpenApiSpec();
  return {
    ...spec,
    servers: spec.servers?.map((server) => ({ ...server, url: new URL(server.url, env.BASE_URL).toString() })),
  } as Document;
}

export const docsOpenApi = createOpenAPI({
  input: () => ({ [OPENAPI_DOCUMENT_ID]: docsOpenApiDocument() }),
});
