import { highlight } from "fumadocs-core/highlight/core";

import type { McpTool } from "@/features/docs/mcp-install-snippet";

import { DOCS_API_KEY_PLACEHOLDER, getMcpInstallSnippet } from "@/features/docs/mcp-install-snippet";
import { DocsCodeBlock } from "@/core/fumadocs/docs-code-block";
import { env } from "@/env";
import { highlighting } from "./highlighting";

const LANGS: Record<McpTool, string> = {
  claudeCode: "bash",
  claudeDesktop: "json",
  codex: "toml",
  cursor: "json",
  gemini: "json",
};

type Props = {
  tool: McpTool;
};

export async function McpInstallSnippet({ tool }: Props) {
  const figure = await highlight(getMcpInstallSnippet(tool, DOCS_API_KEY_PLACEHOLDER, env.BASE_URL), {
    lang: LANGS[tool],
    config: highlighting,
    components: { pre: DocsCodeBlock },
  });

  return <>{figure}</>;
}
