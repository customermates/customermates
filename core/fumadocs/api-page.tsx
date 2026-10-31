import type { ApiPageProps } from "fumadocs-openapi/ui";

import { compile } from "@fumari/json-schema-ts";
import { createAPIPage } from "fumadocs-openapi/ui/base";

import { docsOpenApi } from "./openapi-document";
import { APIHighlightingProvider } from "./api-client";
import { highlighting } from "./highlighting";

const Page = createAPIPage(docsOpenApi, {
  shiki: highlighting,
  generateTypeScriptDefinitions: (schema, context) => {
    if (typeof schema !== "object") return undefined;
    try {
      return compile(schema, {
        name: "Response",
        readOnly: context.readOnly,
        writeOnly: context.writeOnly,
        getSchemaId: context.schema.getRawRef,
      });
    } catch {
      return undefined;
    }
  },
});

export function APIPage(props: ApiPageProps) {
  return (
    <APIHighlightingProvider>
      <Page {...props} />
    </APIHighlightingProvider>
  );
}
