export type McpTool = "claudeCode" | "claudeDesktop" | "codex" | "cursor" | "gemini";

export function getMcpInstallSnippet(tool: McpTool, apiKey: string, baseUrl: string): string {
  const url = `${baseUrl}/api/v1/mcp`;

  switch (tool) {
    case "claudeCode":
      return `claude mcp add --transport http customermates ${url} \\\n  --header "x-api-key: ${apiKey}"`;

    case "cursor":
      return JSON.stringify({ customermates: { url, headers: { "x-api-key": apiKey } } }, null, 2);

    case "codex":
      return `[mcp_servers.customermates]\nenabled = true\nurl = "${url}"\nhttp_headers = { "x-api-key" = "${apiKey}" }`;

    case "claudeDesktop":
      return JSON.stringify(
        {
          mcpServers: {
            customermates: {
              command: "npx",
              args: ["-y", "mcp-remote", url, "--header", `x-api-key:${apiKey}`],
            },
          },
        },
        null,
        2,
      );

    case "gemini":
      return JSON.stringify(
        {
          mcpServers: {
            customermates: {
              httpUrl: url,
              headers: { "x-api-key": apiKey },
            },
          },
        },
        null,
        2,
      );
  }
}
