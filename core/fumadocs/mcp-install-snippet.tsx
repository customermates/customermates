import { DynamicCodeBlock } from "fumadocs-ui/components/dynamic-codeblock";

import type { McpTool } from "@/features/docs/mcp-install-snippet";

import { DOCS_API_KEY_PLACEHOLDER, getMcpInstallSnippet } from "@/features/docs/mcp-install-snippet";
import { env } from "@/env";

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

export function McpInstallSnippet({ tool }: Props) {
  return (
    <DynamicCodeBlock code={getMcpInstallSnippet(tool, DOCS_API_KEY_PLACEHOLDER, env.BASE_URL)} lang={LANGS[tool]} />
  );
}
