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
import type { McpTool } from "@/features/docs/mcp-install-snippet";

describe("McpInstallSnippet", () => {
  it.each<McpTool>(["claudeCode", "claudeDesktop", "codex", "cursor", "gemini"])(
    "ships the %s install snippet already highlighted",
    async (tool) => {
      const html = renderToStaticMarkup((await McpInstallSnippet({ tool })) as ReactElement);

      expect(html).toContain("data-docs-code-block");
      expect(html).toContain("--shiki-light");
      expect(html).toContain("--shiki-dark");
      expect(html).toContain("https://customermates.example/api/v1/mcp");
    },
  );
});
