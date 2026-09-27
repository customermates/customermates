import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { env } from "@/env";

vi.mock("@/env", async (importOriginal) => {
  const actual = await importOriginal<{ env: typeof env }>();
  return { env: { ...actual.env, BASE_URL: "https://crm.example.com" } };
});

import rawManifest from "@/generated/raw-docs-manifest.json";

import { docsOpenApi, OPENAPI_DOCUMENT_ID } from "../openapi-document";

import { generateOpenApiSpec } from "@/core/openapi/openapi-spec";

type Manifest = Record<string, Record<string, Record<string, { content: string }>>>;

describe("docs OpenAPI document", () => {
  it("gives the reference pages an absolute server from the runtime BASE_URL, so server and client render the same code sample", async () => {
    const schemas = await docsOpenApi.getSchemas();

    expect(Object.keys(schemas)).toEqual([OPENAPI_DOCUMENT_ID]);
    expect(schemas[OPENAPI_DOCUMENT_ID].dereferenced.servers?.map((server) => server.url)).toEqual([
      "https://crm.example.com/api",
    ]);
  }, 30_000);

  it("keeps the published spec and the tracked spec file relative", () => {
    const tracked = JSON.parse(readFileSync(join(process.cwd(), "public", "v1", "openapi.json"), "utf8")) as {
      servers: { url: string }[];
    };

    expect(generateOpenApiSpec().servers?.map((server) => server.url)).toEqual(["/api"]);
    expect(tracked.servers.map((server) => server.url)).toEqual(["/api"]);
  });

  it("keys every generated operation page by the relative document id instead of a build-time origin", () => {
    const pages = Object.values((rawManifest as Manifest).api).flatMap((locale) => Object.values(locale));
    const documents = new Set(pages.map((page) => /<APIPage document=\{"([^"]*)"\}/.exec(page.content)?.[1]));

    expect(pages.length).toBeGreaterThan(0);
    expect([...documents]).toEqual([OPENAPI_DOCUMENT_ID]);
  });
});
