import { DynamicCodeBlock } from "fumadocs-ui/components/dynamic-codeblock";

import type { McpTool } from "@/features/docs/mcp-install-snippet";

import { getMcpInstallSnippet } from "@/features/docs/mcp-install-snippet";
import { BASE_URL } from "@/constants/env";

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
  return <DynamicCodeBlock code={getMcpInstallSnippet(tool, "YOUR_KEY", BASE_URL)} lang={LANGS[tool]} />;
}
