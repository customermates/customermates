import { describe, expect, it, vi } from "vitest";

import type { env } from "@/env";

vi.mock("@/env", async (importOriginal) => {
  const actual = await importOriginal<{ env: typeof env }>();
  return { env: { ...actual.env, BASE_URL: "https://crm.example.com" } };
});

import * as route from "../route";

describe("llms.txt", () => {
  it("renders per request, so a self-hosted image advertises its runtime BASE_URL", async () => {
    const text = await route.GET().text();

    expect((route as Record<string, unknown>).dynamic).not.toBe("force-static");
    expect(text).toContain("Native MCP endpoint: https://crm.example.com/api/v1/mcp");
    expect(text).toContain("(https://crm.example.com/en/raw/docs/connect-cli.md)");
    expect(text).not.toContain("http://localhost:4000/api/v1/mcp");
    expect(text).not.toContain("http://localhost:4000/en/");
  }, 30_000);

  it("describes the raw REST operation files as summaries and points to the spec for schemas", async () => {
    const text = await route.GET().text();

    expect(text).toContain("REST operation summaries: one markdown file per endpoint");
    expect(text).toContain("parameters and schemas are in the OpenAPI spec");
    expect(text).toContain("whose HTML page is https://crm.example.com/en/docs.");
  }, 30_000);
});
