import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values
      ? `${key}(${Object.entries(values)
          .map(([name, value]) => `${name}=${String(value)}`)
          .join("|")})`
      : key,
}));

import { ConnectAgentCard } from "../connect-agent-card";

const GUIDE = "https://customermates.com/start.md";
const MCP = "https://customermates.com/api/v1/mcp";

function markup() {
  return renderToStaticMarkup(
    <ConnectAgentCard email="anna@example.com" guideUrl={GUIDE} mcpUrl={MCP} workspaceCount={2} />,
  );
}

describe("ConnectAgentCard", () => {
  it("hands the agent the start guide and the one static MCP address", () => {
    const html = markup();

    expect(html).toContain(`AgentStart.prompt(url=${GUIDE}|mcp=${MCP})`);
    expect(html).not.toContain("/api/v1/mcp/w/");
  });

  it("opens Claude and ChatGPT with the prompt filled in", () => {
    const html = markup();
    const prompt = encodeURIComponent(`AgentStart.prompt(url=${GUIDE}|mcp=${MCP})`);

    expect(html).toContain(`https://claude.ai/new?q=${prompt}`);
    expect(html).toContain(`https://chatgpt.com/?q=${prompt}`);
  });

  it("names the signed-in account and how many workspaces the connection reaches", () => {
    expect(markup()).toContain("AgentStart.connect.account(email=anna@example.com|count=2)");
  });
});
