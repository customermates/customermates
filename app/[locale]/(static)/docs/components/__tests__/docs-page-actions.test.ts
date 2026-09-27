import { describe, expect, it } from "vitest";

import { docsPageActionLinks } from "../docs-page-actions";

const BASE_URL = "https://crm.example.com";

function promptUrl(link: string): string | undefined {
  return /^Read (\S+) /.exec(new URL(link).searchParams.get("q") ?? "")?.[1];
}

describe("docs page actions", () => {
  it("builds every absolute URL in the menu from the one origin the server passes", () => {
    const links = docsPageActionLinks({
      markdownUrl: "/en/raw/docs/connect-cli.md",
      mcpUrl: `${BASE_URL}/api/v1/mcp`,
    });
    const cursorConfig = JSON.parse(atob(new URL(links.cursor).searchParams.get("config") ?? "")) as { url: string };
    const vscodeConfig = JSON.parse(decodeURIComponent(links.vscode.split("?")[1])) as { url: string };

    expect(promptUrl(links.chatgpt)).toBe(`${BASE_URL}/en/raw/docs/connect-cli.md`);
    expect(promptUrl(links.claude)).toBe(`${BASE_URL}/en/raw/docs/connect-cli.md`);
    expect(cursorConfig.url).toBe(`${BASE_URL}/api/v1/mcp`);
    expect(vscodeConfig.url).toBe(`${BASE_URL}/api/v1/mcp`);
  });
});
