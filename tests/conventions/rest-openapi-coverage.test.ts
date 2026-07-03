import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { generateOpenApiSpec } from "@/core/openapi/openapi-spec";
import { REPO_ROOT, walkFiles } from "./walk";

const ENFORCED = true;

const SPEC_EXEMPT_PATHS = new Set(["/v1/mcp", "/v1/openapi"]);
const HTTP_VERBS = new Set(["get", "post", "put", "patch", "delete"]);
const VERB_EXPORT_PATTERN = /export (async )?function (GET|POST|PUT|PATCH|DELETE)/g;

function toSpecPath(routeFile: string): string {
  return routeFile
    .slice(join(REPO_ROOT, "app", "api").length)
    .replace(/\/route\.ts$/, "")
    .replace(/\[([^\]]+)\]/g, "{$1}");
}

function routeOperations(): Map<string, string> {
  const operations = new Map<string, string>();
  const routeFiles = walkFiles(join(REPO_ROOT, "app", "api", "v1"), (path) => path.endsWith("/route.ts"));
  for (const file of routeFiles) {
    const specPath = toSpecPath(file);
    if (SPEC_EXEMPT_PATHS.has(specPath)) continue;
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(VERB_EXPORT_PATTERN)) {
      operations.set(`${match[2].toLowerCase()} ${specPath}`, file.slice(REPO_ROOT.length + 1));
    }
  }
  return operations;
}

function specOperations(): Set<string> {
  const spec = generateOpenApiSpec() as { paths?: Record<string, Record<string, unknown>> };
  const operations = new Set<string>();
  for (const [path, entry] of Object.entries(spec.paths ?? {})) {
    for (const verb of Object.keys(entry)) {
      if (HTTP_VERBS.has(verb)) operations.add(`${verb} ${path}`);
    }
  }
  return operations;
}

describe("v1 REST OpenAPI coverage", () => {
  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("documents every route handler in the OpenAPI spec", () => {
    const documented = specOperations();
    const undocumented = [...routeOperations()]
      .filter(([operation]) => !documented.has(operation))
      .map(([operation, file]) => `${operation} (${file}) has no operation in generateOpenApiSpec()`);
    expect(undocumented).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("has a route handler for every spec operation", () => {
    const routes = routeOperations();
    const orphaned = [...specOperations()]
      .filter((operation) => !routes.has(operation))
      .map((operation) => `${operation} is in generateOpenApiSpec() but has no route handler under app/api/v1`);
    expect(orphaned).toEqual([]);
  });
});
