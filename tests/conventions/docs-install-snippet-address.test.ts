import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

/**
 * A page that renders <McpInstallSnippet> tells the reader its snippets already carry the address of
 * the site showing it. A hand-written code block on the same page that still holds the literal
 * `<BASE_URL>` placeholder breaks that promise, so it repeats only the lines that change instead.
 */
export function placeholderBlocksBesideSnippets(sources: { file: string; text: string }[]) {
  const found: string[] = [];

  for (const { file, text } of sources) {
    if (!text.includes("<McpInstallSnippet")) continue;

    let inFence = false;
    text.split("\n").forEach((line, index) => {
      if (line.trimStart().startsWith("```")) {
        inFence = !inFence;
        return;
      }
      if (inFence && line.includes("<BASE_URL>")) found.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }

  return found;
}

function docFiles() {
  return walkFiles(join(REPO_ROOT, "content", "docs"), (path) => path.endsWith(".mdx"));
}

describe("install snippet pages", () => {
  it("hold no code block with a literal <BASE_URL> beside the generated snippets", () => {
    const sources = docFiles().map((file) => ({ file: relative(REPO_ROOT, file), text: readFileSync(file, "utf8") }));

    expect(sources.some(({ text }) => text.includes("<McpInstallSnippet"))).toBe(true);
    expect(placeholderBlocksBesideSnippets(sources)).toEqual([]);
  });

  it("finds a placeholder only inside a fenced block on a page with a generated snippet", () => {
    const fenced = '<McpInstallSnippet tool="codex" />\n\n```toml\nurl = "<BASE_URL>/api/v1/mcp"\n```';
    const prose = '<McpInstallSnippet tool="codex" />\n\nThe endpoint is `<BASE_URL>/api/v1/mcp`.';
    const withoutSnippet = '```bash\ncurl "<BASE_URL>/api/v1/openapi"\n```';

    expect(placeholderBlocksBesideSnippets([{ file: "a.mdx", text: fenced }])).toHaveLength(1);
    expect(placeholderBlocksBesideSnippets([{ file: "b.mdx", text: prose }])).toEqual([]);
    expect(placeholderBlocksBesideSnippets([{ file: "c.mdx", text: withoutSnippet }])).toEqual([]);
  });
});
