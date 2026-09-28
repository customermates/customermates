import type { ReactElement } from "react";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({ env: { BASE_URL: "https://customermates.example" } }));
vi.mock("@/core/fumadocs/docs-code-block", async () => {
  const { createElement: element } = await import("react");
  return {
    DocsCodeBlock: (props: Record<string, unknown>) => element("pre", { ...props, "data-docs-code-block": "" }),
  };
});

import { McpInstallSnippet } from "../mcp-install-snippet";

describe("McpInstallSnippet", () => {
  it("ships the install snippet already highlighted, so the figure does not change after hydration", async () => {
    const html = renderToStaticMarkup((await McpInstallSnippet({ tool: "codex" })) as ReactElement);

    expect(html).toContain("data-docs-code-block");
    expect(html).toContain("--shiki-light");
    expect(html).toContain("--shiki-dark");
    expect(html).toContain("https://customermates.example/api/v1/mcp");
  });
});
